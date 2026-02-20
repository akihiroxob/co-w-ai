import { addActivityEvent, findTask, state } from "../libs/state";
import { workers } from "../libs/workers";
import { issueTaskId } from "./idUtil";
import { getIsoTime } from "./timeUtil";
import { ensureTaskWorktree } from "./gitUtil";
import type { Task } from "../types/Task";

type ClaimTaskSuccess = {
  ok: true;
  task: Task;
  worktreePath: string;
  branch: string;
};

type ClaimTaskFailure = {
  ok: false;
  error:
    | "TASK_NOT_FOUND"
    | "INVALID_STATE"
    | "ASSIGNEE_MISMATCH"
    | "REWORK_PRIORITY_REQUIRED"
    | "WORKER_NOT_FOUND"
    | "WORKTREE_SETUP_FAILED";
  taskId: string;
  agentId: string;
  status?: string;
  assignee?: string;
  requestedBy?: string;
  prioritizedTaskId?: string;
  reason?: string;
  detail?: unknown;
};

export type ClaimTaskResult = ClaimTaskSuccess | ClaimTaskFailure;

export const claimTaskForAgent = async (taskId: string, agentId: string): Promise<ClaimTaskResult> => {
  const task = findTask(taskId);
  if (!task) {
    return { ok: false, error: "TASK_NOT_FOUND", taskId, agentId };
  }

  if (task.status !== "todo" && task.status !== "rejected") {
    return { ok: false, error: "INVALID_STATE", taskId, agentId, status: task.status };
  }

  if (task.assignee && task.assignee !== agentId) {
    return {
      ok: false,
      error: "ASSIGNEE_MISMATCH",
      taskId,
      agentId,
      assignee: task.assignee,
      requestedBy: agentId,
    };
  }

  const prioritizedReworkTask = state.tasks.find(
    (t) =>
      t.id !== taskId &&
      (t.status === "rejected" || t.status === "todo") &&
      t.assignee === agentId &&
      t.reworkRequested === true,
  );
  if (prioritizedReworkTask) {
    return {
      ok: false,
      error: "REWORK_PRIORITY_REQUIRED",
      taskId,
      agentId,
      prioritizedTaskId: prioritizedReworkTask.id,
    };
  }

  const worker = workers.get(agentId);
  if (!worker) {
    return { ok: false, error: "WORKER_NOT_FOUND", taskId, agentId };
  }

  const worktreeSetup = await ensureTaskWorktree(worker, agentId, taskId);
  if (!worktreeSetup.ok) {
    return {
      ok: false,
      error: "WORKTREE_SETUP_FAILED",
      taskId,
      agentId,
      reason: worktreeSetup.error,
      detail: worktreeSetup.detail,
    };
  }

  task.assignee = agentId;
  task.status = "doing";
  task.reworkRequested = false;
  task.updatedAt = getIsoTime();

  addActivityEvent({
    id: issueTaskId("evt"),
    timestamp: task.updatedAt,
    type: "workflow",
    action: "task_claimed",
    detail: `${taskId} claimed by ${agentId}`,
    agentId,
  });

  return {
    ok: true,
    task,
    worktreePath: worktreeSetup.worktreePath,
    branch: worktreeSetup.branch,
  };
};
