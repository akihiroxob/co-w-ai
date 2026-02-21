import { addActivityEvent, state } from "../libs/state";
import { workers } from "../libs/workers";
import { issueTaskId } from "./idUtil";
import { getIsoTime } from "./timeUtil";
import { execCommandCapture, resolveCommandFromPolicy } from "./shellUtil";
import { loadRepoPolicy } from "./policyUtil";
import { validateTaskWorktree } from "./gitUtil";
import { acceptTaskWithPolicy } from "./acceptTaskUtil";
import { findPmAgentId, findTechLeadAgentId } from "./reviewTaskUtil";
import type { Task, TaskStatus } from "../types/Task";
import path from "node:path";

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

const shellQuote = (v: string) => {
  return `"${v.replace(/(["\\$`])/g, "\\$1")}"`;
};

const buildExecutionPrompt = (task: Task, agentId: string) => {
  return [
    "You are a software worker agent running inside an assigned git worktree.",
    "Implement the requested task directly in the repository with minimal, safe changes.",
    "Run local checks as needed and keep the change scope focused.",
    "If work takes longer than expected, call reportProgress(taskId, agentId, message) to post short status updates.",
    "",
    `Task ID: ${task.id}`,
    `Agent ID: ${agentId}`,
    `Title: ${task.title}`,
    `Description: ${task.description ?? "(none)"}`,
  ].join("\n");
};

const buildReviewPrompt = (task: Task, agentId: string, stage: "in_review" | "wait_accept" | "accepted") => {
  const perspective =
    stage === "in_review"
      ? "Check code quality, correctness, maintainability, and risk."
      : stage === "wait_accept"
        ? "Check acceptance criteria fulfillment only."
        : "Finalize merge readiness and execute final integration decision.";
  const rolePrompt = stage === "wait_accept" ? "You are a PM/planning reviewer agent." : "You are a TechLead reviewer agent.";
  return [
    rolePrompt,
    "Do not implement code in this task.",
    perspective,
    "Review the target task result and make a decision.",
    "You must call one of these tools against the target task:",
    "- acceptTask(taskId=targetTaskId)",
    "- rejectTask(taskId=targetTaskId, reason=clear reason)",
    "If you reject, reason must be concrete and actionable.",
    "",
    `Review Stage: ${stage}`,
    `Agent ID: ${agentId}`,
    `Target Task ID: ${task.id}`,
    `Target Title: ${task.title}`,
    `Target Description: ${task.description ?? "(none)"}`,
  ].join("\n");
};

const markTaskRejected = (task: Task, reason: string, agentId: string) => {
  task.status = "rejected";
  task.reworkRequested = true;
  task.updatedAt = getIsoTime();
  task.reworkReason = reason;
  task.reworkCount = (task.reworkCount ?? 0) + 1;

  addActivityEvent({
    id: issueTaskId("evt"),
    timestamp: task.updatedAt,
    type: "workflow",
    action: "task_rejected",
    detail: `${task.id} rejected: ${reason}`,
    agentId,
  });
};

const actorForStage = (task: Task): { stage: TaskStatus; agentId?: string } => {
  if (task.status === "doing") return { stage: "doing", agentId: task.assignee };
  if (task.status === "in_review") return { stage: "in_review", agentId: findTechLeadAgentId() };
  if (task.status === "wait_accept") return { stage: "wait_accept", agentId: findPmAgentId() };
  if (task.status === "accepted") return { stage: "accepted", agentId: findTechLeadAgentId() };
  return { stage: task.status };
};

export const startWorkerExecutionLoop = () => {
  const enabled =
    parseBool(process.env.COWAI_AUTO_EXECUTE) ||
    parseBool(process.env.COWAI_ENABLE_WORKFLOW_EXECUTION);
  if (!enabled) {
    return { enabled: false as const };
  }

  const intervalMs = parsePositiveInt(process.env.COWAI_AUTO_EXECUTE_INTERVAL_MS, 5000);
  const commandTimeoutMs = parsePositiveInt(process.env.COWAI_AUTO_EXECUTE_TIMEOUT_MS, 20 * 60 * 1000);
  const heartbeatIntervalMs = parsePositiveInt(
    process.env.COWAI_AUTO_EXECUTE_HEARTBEAT_INTERVAL_MS,
    10000,
  );
  const autoVerify = parseBool(process.env.COWAI_AUTO_VERIFY_ON_EXECUTE);
  const autoAccept = parseBool(process.env.COWAI_AUTO_ACCEPT_ON_EXECUTE);
  const inFlightByTask = new Set<string>();
  const executedTokenByTask = new Map<string, string>();

  const runOneTask = async (taskId: string) => {
    const task = state.tasks.find((t) => t.id === taskId);
    if (!task) return;

    if (!task.assignee) {
      markTaskRejected(task, "task assignee is required", "system");
      return;
    }

    const ownerWorker = workers.get(task.assignee);
    if (!ownerWorker) {
      markTaskRejected(task, "task assignee worker not found", task.assignee);
      return;
    }

    const { stage, agentId } = actorForStage(task);
    if (!agentId) {
      markTaskRejected(task, `reviewer not found for stage ${stage}`, "system");
      return;
    }

    const actorWorker = workers.get(agentId);
    if (!actorWorker) {
      markTaskRejected(task, `worker not found: ${agentId}`, agentId);
      return;
    }

    const worktree = await validateTaskWorktree(ownerWorker, task.assignee, task.id);
    if (!worktree.ok) {
      markTaskRejected(task, `worktree invalid: ${worktree.error}`, agentId);
      return;
    }

    addActivityEvent({
      id: issueTaskId("evt"),
      timestamp: getIsoTime(),
      type: "agent",
      action: "worker_execution_started",
      detail: `${task.id} by ${agentId} at ${stage}`,
      agentId,
    });

    const prompt =
      stage === "doing"
        ? buildExecutionPrompt(task, agentId)
        : buildReviewPrompt(task, agentId, stage as "in_review" | "wait_accept" | "accepted");
    const command = `${actorWorker.codexCmd} exec ${shellQuote(prompt)} --skip-git-repo-check`;
    const executionStartedAtMs = Date.now();
    const heartbeatTimer = setInterval(() => {
      const elapsedMs = Date.now() - executionStartedAtMs;
      addActivityEvent({
        id: issueTaskId("evt"),
        timestamp: getIsoTime(),
        type: "agent",
        action: "worker_execution_heartbeat",
        detail: `${task.id} running elapsedMs=${elapsedMs}`,
        agentId,
      });
    }, heartbeatIntervalMs);

    const run = await (async () => {
      try {
        return await execCommandCapture(command, worktree.worktreePath, {
          timeoutMs: commandTimeoutMs,
          env: {
            COWAI_WORKERS_FILE: path.join(actorWorker.repoPath, "settings", "workers.yaml"),
            COWAI_ACTIVITY_LOG_FILE: path.join(actorWorker.repoPath, "logs", "activity.ndjson"),
            COWAI_STATE_FILE: path.join(actorWorker.repoPath, "logs", "state.json"),
          },
        });
      } finally {
        clearInterval(heartbeatTimer);
      }
    })();
    state.lastCommand = run;

    if (!run.ok) {
      markTaskRejected(task, "worker command failed", agentId);
      addActivityEvent({
        id: issueTaskId("evt"),
        timestamp: getIsoTime(),
        type: "agent",
        action: "worker_execution_failed",
        detail: `${task.id} exit=${String(run.exitCode)} timeout=${String(run.timedOut)}`,
        agentId,
      });
      return;
    }

    addActivityEvent({
      id: issueTaskId("evt"),
      timestamp: getIsoTime(),
      type: "agent",
      action: "worker_execution_succeeded",
      detail: `${task.id} command completed`,
      agentId,
    });

    if (stage === "doing") {
      if (autoVerify) {
        const role = state.agentRoles[agentId];
        const commandKey = role?.verifyCommandKey;
        if (!commandKey) {
          markTaskRejected(task, "verify command key not found", agentId);
          return;
        }

        let resolved;
        try {
          const policy = await loadRepoPolicy(ownerWorker.repoPath);
          resolved = resolveCommandFromPolicy(policy, commandKey);
        } catch (e: any) {
          markTaskRejected(task, `verify setup failed: ${String(e?.message ?? e)}`, agentId);
          return;
        }

        const verify = await execCommandCapture(resolved.command, worktree.worktreePath, {
          timeoutMs: commandTimeoutMs,
        });
        state.lastCommand = verify;

        if (!verify.ok) {
          markTaskRejected(task, `verify failed: ${commandKey}`, agentId);
          addActivityEvent({
            id: issueTaskId("evt"),
            timestamp: getIsoTime(),
            type: "agent",
            action: "worker_verify_failed",
            detail: `${task.id} verify failed: ${commandKey}`,
            agentId,
          });
          return;
        }

        addActivityEvent({
          id: issueTaskId("evt"),
          timestamp: getIsoTime(),
          type: "agent",
          action: "worker_verify_succeeded",
          detail: `${task.id} verify passed: ${commandKey}`,
          agentId,
        });
      }

      task.status = "in_review";
      task.reworkRequested = false;
      task.reworkReason = undefined;
      task.updatedAt = getIsoTime();

      addActivityEvent({
        id: issueTaskId("evt"),
        timestamp: task.updatedAt,
        type: "workflow",
        action: "task_submitted",
        detail: `${task.id} auto-submitted by ${agentId}`,
        agentId,
      });

      if (autoAccept) {
        const tlAccepted = await acceptTaskWithPolicy(task.id);
        if (!tlAccepted.ok) {
          markTaskRejected(task, `auto-accept failed: ${tlAccepted.error}`, agentId);
          return;
        }
        const pmAccepted = await acceptTaskWithPolicy(task.id);
        if (!pmAccepted.ok) {
          markTaskRejected(task, `auto-accept failed: ${pmAccepted.error}`, agentId);
          return;
        }
        const merged = await acceptTaskWithPolicy(task.id);
        if (!merged.ok) {
          markTaskRejected(task, `auto-accept failed: ${merged.error}`, agentId);
          return;
        }
      }
      return;
    }

    if (task.status === stage) {
      markTaskRejected(task, `review decision missing at ${stage}`, agentId);
      addActivityEvent({
        id: issueTaskId("evt"),
        timestamp: getIsoTime(),
        type: "workflow",
        action: "planning_reject_task",
        detail: `${task.id} rejected: review decision missing at ${stage}`,
        agentId,
      });
      return;
    }

    addActivityEvent({
      id: issueTaskId("evt"),
      timestamp: getIsoTime(),
      type: "workflow",
      action: "review_stage_completed",
      detail: `${task.id} moved ${stage} -> ${task.status}`,
      agentId,
    });
  };

  const tick = async () => {
    const candidates = state.tasks.filter((t) =>
      t.status === "doing" || t.status === "in_review" || t.status === "wait_accept" || t.status === "accepted",
    );

    for (const task of candidates) {
      const token = `${task.status}:${task.updatedAt}`;
      if (executedTokenByTask.get(task.id) === token) continue;
      if (inFlightByTask.has(task.id)) continue;

      inFlightByTask.add(task.id);
      executedTokenByTask.set(task.id, token);
      try {
        await runOneTask(task.id);
      } finally {
        inFlightByTask.delete(task.id);
      }
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
    action: "worker_execution_loop_started",
    detail: `intervalMs=${intervalMs}, timeoutMs=${commandTimeoutMs}, heartbeatIntervalMs=${heartbeatIntervalMs}, autoVerify=${autoVerify}, autoAccept=${autoAccept}`,
  });

  return {
    enabled: true as const,
    intervalMs,
    commandTimeoutMs,
    autoVerify,
    autoAccept,
    timer,
  };
};
