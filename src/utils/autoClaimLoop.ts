import { state, addActivityEvent } from "../libs/state";
import { workers } from "../libs/workers";
import { claimTaskForAgent } from "./taskClaimUtil";
import { issueTaskId } from "./idUtil";
import { getIsoTime } from "./timeUtil";

const parseBool = (v: string | undefined) => {
  if (!v) return false;
  return ["1", "true", "yes", "on"].includes(v.toLowerCase());
};

const parsePositiveInt = (v: string | undefined, fallback: number) => {
  if (!v) return fallback;
  const parsed = Number.parseInt(v, 10);
  if (!Number.isFinite(parsed) || parsed < 1) return fallback;
  return parsed;
};

const pickNextTask = (agentId: string) => {
  const rework = state.tasks.find(
    (t) => t.status === "todo" && t.assignee === agentId && t.reworkRequested === true,
  );
  if (rework) return rework;
  return state.tasks.find((t) => t.status === "todo" && t.assignee === agentId);
};

export const startAutoClaimLoop = () => {
  if (!parseBool(process.env.COWAI_AUTO_CLAIM)) {
    return { enabled: false as const };
  }

  const intervalMs = parsePositiveInt(process.env.COWAI_AUTO_CLAIM_INTERVAL_MS, 5000);
  const maxDoingPerAgent = parsePositiveInt(process.env.COWAI_AUTO_CLAIM_MAX_DOING_PER_AGENT, 1);
  let inFlight = false;

  const tick = async () => {
    if (inFlight) return;
    inFlight = true;

    try {
      for (const [agentId] of workers) {
        const doingCount = state.tasks.filter((t) => t.status === "doing" && t.assignee === agentId).length;
        if (doingCount >= maxDoingPerAgent) continue;

        const candidate = pickNextTask(agentId);
        if (!candidate) continue;

        const result = await claimTaskForAgent(candidate.id, agentId);
        if (!result.ok) {
          addActivityEvent({
            id: issueTaskId("evt"),
            timestamp: getIsoTime(),
            type: "system",
            action: "auto_claim_failed",
            detail: `${candidate.id} for ${agentId}: ${result.error}`,
            agentId,
          });
        }
      }
    } finally {
      inFlight = false;
    }
  };

  const timer = setInterval(() => {
    void tick();
  }, intervalMs);
  void tick();

  addActivityEvent({
    id: issueTaskId("evt"),
    timestamp: getIsoTime(),
    type: "system",
    action: "auto_claim_loop_started",
    detail: `intervalMs=${intervalMs}, maxDoingPerAgent=${maxDoingPerAgent}`,
  });

  return {
    enabled: true as const,
    intervalMs,
    maxDoingPerAgent,
    timer,
  };
};
