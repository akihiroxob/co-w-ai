import { addActivityEvent, state } from "../libs/state";
import { workers } from "../libs/workers";
import { issueTaskId } from "./idUtil";
import { getIsoTime } from "./timeUtil";
import { execCommandCapture, resolveCommandFromPolicy } from "./shellUtil";
import { loadRepoPolicy } from "./policyUtil";
import { validateTaskWorktree } from "./gitUtil";

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

const buildExecutionPrompt = (taskId: string, title: string, description?: string) => {
  return [
    "You are a software worker agent running inside an assigned git worktree.",
    "Implement the requested task directly in the repository with minimal, safe changes.",
    "Run local checks as needed and keep the change scope focused.",
    "",
    `Task ID: ${taskId}`,
    `Title: ${title}`,
    `Description: ${description ?? "(none)"}`,
  ].join("\n");
};

const markTaskBlocked = (taskId: string, reason: string, agentId: string) => {
  const task = state.tasks.find((t) => t.id === taskId);
  if (!task) return;
  task.status = "blocked";
  task.updatedAt = getIsoTime();
  task.reworkReason = reason;

  addActivityEvent({
    id: issueTaskId("evt"),
    timestamp: task.updatedAt,
    type: "workflow",
    action: "task_blocked",
    detail: `${task.id} blocked: ${reason}`,
    agentId,
  });
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
  const autoVerify = parseBool(process.env.COWAI_AUTO_VERIFY_ON_EXECUTE);
  const autoAccept = parseBool(process.env.COWAI_AUTO_ACCEPT_ON_EXECUTE);
  const inFlightByTask = new Set<string>();
  const executedTokenByTask = new Map<string, string>();

  const runOneTask = async (taskId: string) => {
    const task = state.tasks.find((t) => t.id === taskId);
    if (!task || task.status !== "doing" || !task.assignee) return;

    const worker = workers.get(task.assignee);
    if (!worker) {
      markTaskBlocked(task.id, "worker not found", task.assignee);
      return;
    }

    const worktree = await validateTaskWorktree(worker, task.assignee, task.id);
    if (!worktree.ok) {
      markTaskBlocked(task.id, `worktree invalid: ${worktree.error}`, task.assignee);
      return;
    }

    addActivityEvent({
      id: issueTaskId("evt"),
      timestamp: getIsoTime(),
      type: "agent",
      action: "worker_execution_started",
      detail: `${task.id} by ${task.assignee}`,
      agentId: task.assignee,
    });

    const prompt = buildExecutionPrompt(task.id, task.title, task.description);
    const command = `${worker.codexCmd} exec ${shellQuote(prompt)} --skip-git-repo-check`;
    const run = await execCommandCapture(command, worktree.worktreePath, {
      timeoutMs: commandTimeoutMs,
    });
    state.lastCommand = run;

    if (!run.ok) {
      markTaskBlocked(task.id, "worker command failed", task.assignee);
      addActivityEvent({
        id: issueTaskId("evt"),
        timestamp: getIsoTime(),
        type: "agent",
        action: "worker_execution_failed",
        detail: `${task.id} exit=${String(run.exitCode)} timeout=${String(run.timedOut)}`,
        agentId: task.assignee,
      });
      return;
    }

    addActivityEvent({
      id: issueTaskId("evt"),
      timestamp: getIsoTime(),
      type: "agent",
      action: "worker_execution_succeeded",
      detail: `${task.id} command completed`,
      agentId: task.assignee,
    });

    if (autoVerify) {
      const role = state.agentRoles[task.assignee];
      const commandKey = role?.verifyCommandKey;
      if (!commandKey) {
        markTaskBlocked(task.id, "verify command key not found", task.assignee);
        return;
      }

      let resolved;
      try {
        const policy = await loadRepoPolicy(worker.repoPath);
        resolved = resolveCommandFromPolicy(policy, commandKey);
      } catch (e: any) {
        markTaskBlocked(task.id, `verify setup failed: ${String(e?.message ?? e)}`, task.assignee);
        return;
      }

      const verify = await execCommandCapture(resolved.command, worktree.worktreePath, {
        timeoutMs: commandTimeoutMs,
      });
      state.lastCommand = verify;

      if (!verify.ok) {
        markTaskBlocked(task.id, `verify failed: ${commandKey}`, task.assignee);
        addActivityEvent({
          id: issueTaskId("evt"),
          timestamp: getIsoTime(),
          type: "agent",
          action: "worker_verify_failed",
          detail: `${task.id} verify failed: ${commandKey}`,
          agentId: task.assignee,
        });
        return;
      }

      addActivityEvent({
        id: issueTaskId("evt"),
        timestamp: getIsoTime(),
        type: "agent",
        action: "worker_verify_succeeded",
        detail: `${task.id} verify passed: ${commandKey}`,
        agentId: task.assignee,
      });
    }

    task.status = "wait_accept";
    task.reworkRequested = false;
    task.reworkReason = undefined;
    task.updatedAt = getIsoTime();

    addActivityEvent({
      id: issueTaskId("evt"),
      timestamp: task.updatedAt,
      type: "workflow",
      action: "task_submitted",
      detail: `${task.id} auto-submitted by ${task.assignee}`,
      agentId: task.assignee,
    });

    if (autoAccept) {
      task.status = "done";
      task.updatedAt = getIsoTime();
      addActivityEvent({
        id: issueTaskId("evt"),
        timestamp: task.updatedAt,
        type: "workflow",
        action: "planning_accept_task",
        detail: `${task.id} auto-accepted`,
        agentId: task.assignee,
      });
    }
  };

  const tick = async () => {
    const candidates = state.tasks.filter((t) => t.status === "doing" && Boolean(t.assignee));
    for (const task of candidates) {
      if (!task.assignee) continue;
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
    detail: `intervalMs=${intervalMs}, timeoutMs=${commandTimeoutMs}, autoVerify=${autoVerify}, autoAccept=${autoAccept}`,
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
