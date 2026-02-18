import { addActivityEvent, state } from "../libs/state";
import { workers } from "../libs/workers";
import { issueTaskId } from "./idUtil";
import { getIsoTime } from "./timeUtil";
import { execCommandCapture, resolveCommandFromPolicy } from "./shellUtil";
import { loadRepoPolicy } from "./policyUtil";
import { validateTaskWorktree } from "./gitUtil";
import { queuePmReviewTask } from "./reviewTaskUtil";
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

const buildExecutionPrompt = (
  taskId: string,
  agentId: string,
  title: string,
  description?: string,
) => {
  return [
    "You are a software worker agent running inside an assigned git worktree.",
    "Implement the requested task directly in the repository with minimal, safe changes.",
    "Run local checks as needed and keep the change scope focused.",
    "If work takes longer than expected, call reportProgress(taskId, agentId, message) to post short status updates.",
    "",
    `Task ID: ${taskId}`,
    `Agent ID: ${agentId}`,
    `Title: ${title}`,
    `Description: ${description ?? "(none)"}`,
  ].join("\n");
};

const buildPmReviewPrompt = (
  reviewTaskId: string,
  agentId: string,
  targetTaskId: string,
  targetTitle: string,
  targetDescription?: string,
) => {
  return [
    "You are a PM/planning worker agent.",
    "Do not implement code in this task.",
    "Review the target task result and make a decision.",
    "You must call one of these tools against the target task:",
    "- acceptTask(taskId=targetTaskId)",
    "- rejectTask(taskId=targetTaskId, reason=clear reason)",
    "If you reject, reason must be concrete and actionable.",
    "",
    `Review Task ID: ${reviewTaskId}`,
    `Agent ID: ${agentId}`,
    `Target Task ID: ${targetTaskId}`,
    `Target Title: ${targetTitle}`,
    `Target Description: ${targetDescription ?? "(none)"}`,
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

    const reviewTarget =
      task.taskType === "pm_review" && task.reviewTargetTaskId
        ? state.tasks.find((t) => t.id === task.reviewTargetTaskId)
        : undefined;
    const prompt =
      task.taskType === "pm_review" && task.reviewTargetTaskId
        ? buildPmReviewPrompt(
            task.id,
            task.assignee,
            task.reviewTargetTaskId,
            reviewTarget?.title ?? "(target not found)",
            reviewTarget?.description,
          )
        : buildExecutionPrompt(task.id, task.assignee, task.title, task.description);
    const command = `${worker.codexCmd} exec ${shellQuote(prompt)} --skip-git-repo-check`;
    const executionStartedAtMs = Date.now();
    const heartbeatTimer = setInterval(() => {
      const elapsedMs = Date.now() - executionStartedAtMs;
      addActivityEvent({
        id: issueTaskId("evt"),
        timestamp: getIsoTime(),
        type: "agent",
        action: "worker_execution_heartbeat",
        detail: `${task.id} running elapsedMs=${elapsedMs}`,
        agentId: task.assignee,
      });
    }, heartbeatIntervalMs);

    const run = await (async () => {
      try {
        return await execCommandCapture(command, worktree.worktreePath, {
          timeoutMs: commandTimeoutMs,
          env: {
            COWAI_WORKERS_FILE: path.join(worker.repoPath, "settings", "workers.yaml"),
            COWAI_ACTIVITY_LOG_FILE: path.join(worker.repoPath, "logs", "activity.ndjson"),
            COWAI_STATE_FILE: path.join(worker.repoPath, "logs", "state.json"),
          },
        });
      } finally {
        clearInterval(heartbeatTimer);
      }
    })();
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

    if (task.taskType === "pm_review") {
      const targetTask = task.reviewTargetTaskId
        ? state.tasks.find((t) => t.id === task.reviewTargetTaskId)
        : undefined;
      if (!targetTask) {
        markTaskBlocked(task.id, "review target not found", task.assignee);
        return;
      }

      if (targetTask.status === "wait_accept") {
        markTaskBlocked(task.id, "review decision missing (target still wait_accept)", task.assignee);
        addActivityEvent({
          id: issueTaskId("evt"),
          timestamp: getIsoTime(),
          type: "workflow",
          action: "pm_review_missing_decision",
          detail: `${task.id} did not finalize ${targetTask.id}`,
          agentId: task.assignee,
        });
        return;
      }

      task.status = "done";
      task.updatedAt = getIsoTime();
      addActivityEvent({
        id: issueTaskId("evt"),
        timestamp: task.updatedAt,
        type: "workflow",
        action: "pm_review_completed",
        detail: `${task.id} completed decision for ${targetTask.id}`,
        agentId: task.assignee,
      });
      return;
    }

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
    if (!autoAccept) {
      queuePmReviewTask(task);
    }

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
