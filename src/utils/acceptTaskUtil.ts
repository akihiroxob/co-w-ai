import { addActivityEvent, findTask } from "../libs/state";
import { workers } from "../libs/workers";
import { issueTaskId } from "./idUtil";
import { getIsoTime } from "./timeUtil";
import { execCommandCapture } from "./shellUtil";
import { validateTaskWorktree } from "./gitUtil";
import type { Task } from "../types/Task";

type AcceptTaskResult =
  | {
      ok: true;
      task: Task;
      integration:
        | { enabled: false; status: "skipped" }
        | {
            enabled: true;
            status: "applied" | "already_applied";
            targetBranch: string;
            commit: string;
          };
    }
  | {
      ok: false;
      error: "TASK_NOT_FOUND" | "INVALID_STATE" | "AUTO_INTEGRATE_FAILED";
      taskId: string;
      status?: Task["status"];
      reason?: string;
      detail?: unknown;
    };

type IntegrationResult =
  | { enabled: false; status: "skipped" }
  | {
      enabled: true;
      status: "applied" | "already_applied";
      targetBranch: string;
      commit: string;
    };

const shellQuote = (v: string) => `"${v.replace(/(["\\$`])/g, "\\$1")}"`;

const integrateAcceptedTask = async (task: Task) => {
  const targetBranch = process.env.COWAI_INTEGRATION_TARGET_BRANCH?.trim() || "main";

  if (!task.assignee) {
    return {
      ok: false as const,
      reason: "task assignee is required for auto integration",
    };
  }

  const worker = workers.get(task.assignee);
  if (!worker) {
    return {
      ok: false as const,
      reason: `worker not found: ${task.assignee}`,
    };
  }

  const worktree = await validateTaskWorktree(worker, task.assignee, task.id);
  if (!worktree.ok) {
    return {
      ok: false as const,
      reason: `task worktree invalid: ${worktree.error}`,
      detail: worktree,
    };
  }

  const statusInTask = await execCommandCapture("git status --porcelain", worktree.worktreePath);
  if (!statusInTask.ok) {
    return { ok: false as const, reason: "failed to read task worktree status", detail: statusInTask };
  }

  if (statusInTask.stdout.trim().length > 0) {
    const addRes = await execCommandCapture("git add -A", worktree.worktreePath);
    if (!addRes.ok) {
      return { ok: false as const, reason: "failed to stage task worktree changes", detail: addRes };
    }

    const commitMessage = `cowai: apply ${task.id}`;
    const commitRes = await execCommandCapture(
      `git commit -m ${shellQuote(commitMessage)}`,
      worktree.worktreePath,
    );
    if (!commitRes.ok) {
      return { ok: false as const, reason: "failed to commit task worktree changes", detail: commitRes };
    }
  }

  const commitRes = await execCommandCapture("git rev-parse HEAD", worktree.worktreePath);
  if (!commitRes.ok) {
    return { ok: false as const, reason: "failed to resolve task commit", detail: commitRes };
  }
  const commit = commitRes.stdout.trim();

  const branchRes = await execCommandCapture("git rev-parse --abbrev-ref HEAD", worker.repoPath);
  if (!branchRes.ok) {
    return { ok: false as const, reason: "failed to resolve target branch", detail: branchRes };
  }
  const currentBranch = branchRes.stdout.trim();
  if (currentBranch !== targetBranch) {
    return {
      ok: false as const,
      reason: `target repo is on ${currentBranch}, expected ${targetBranch}`,
    };
  }

  const targetStatus = await execCommandCapture("git status --porcelain --untracked-files=no", worker.repoPath);
  if (!targetStatus.ok) {
    return { ok: false as const, reason: "failed to check target branch status", detail: targetStatus };
  }
  if (targetStatus.stdout.trim().length > 0) {
    return { ok: false as const, reason: "target branch has local tracked changes" };
  }

  const ancestorRes = await execCommandCapture(
    `git merge-base --is-ancestor ${shellQuote(commit)} HEAD`,
    worker.repoPath,
  );
  if (ancestorRes.ok) {
    addActivityEvent({
      id: issueTaskId("evt"),
      timestamp: getIsoTime(),
      type: "workflow",
      action: "task_auto_integrated",
      detail: `${task.id} already on ${targetBranch} (commit=${commit})`,
      agentId: task.assignee,
    });
    return { ok: true as const, status: "already_applied" as const, targetBranch, commit };
  }

  const cherryPickRes = await execCommandCapture(
    `git cherry-pick --no-edit ${shellQuote(commit)}`,
    worker.repoPath,
  );
  if (!cherryPickRes.ok) {
    return { ok: false as const, reason: "git cherry-pick failed", detail: cherryPickRes };
  }

  addActivityEvent({
    id: issueTaskId("evt"),
    timestamp: getIsoTime(),
    type: "workflow",
    action: "task_auto_integrated",
    detail: `${task.id} integrated into ${targetBranch} (commit=${commit})`,
    agentId: task.assignee,
  });

  return { ok: true as const, status: "applied" as const, targetBranch, commit };
};

export const acceptTaskWithPolicy = async (taskId: string): Promise<AcceptTaskResult> => {
  const task = findTask(taskId);
  if (!task) {
    return { ok: false, error: "TASK_NOT_FOUND", taskId };
  }

  if (task.status !== "in_review" && task.status !== "wait_accept" && task.status !== "accepted") {
    return { ok: false, error: "INVALID_STATE", taskId, status: task.status };
  }

  if (task.status === "in_review") {
    task.status = "wait_accept";
    task.updatedAt = getIsoTime();
    addActivityEvent({
      id: issueTaskId("evt"),
      timestamp: task.updatedAt,
      type: "workflow",
      action: "techlead_accept_task",
      detail: `${taskId} accepted in in_review -> wait_accept`,
    });
    return {
      ok: true,
      task,
      integration: {
        enabled: false,
        status: "skipped",
      },
    };
  }

  if (task.status === "wait_accept") {
    task.status = "accepted";
    task.updatedAt = getIsoTime();
    addActivityEvent({
      id: issueTaskId("evt"),
      timestamp: task.updatedAt,
      type: "workflow",
      action: "planning_accept_task",
      detail: `${taskId} accepted in wait_accept -> accepted`,
    });
    return {
      ok: true,
      task,
      integration: {
        enabled: false,
        status: "skipped",
      },
    };
  }

  const integrated = await integrateAcceptedTask(task);
  if (!integrated.ok) {
    addActivityEvent({
      id: issueTaskId("evt"),
      timestamp: getIsoTime(),
      type: "workflow",
      action: "task_auto_integrate_failed",
      detail: `${taskId} failed: ${integrated.reason}`,
      agentId: task.assignee,
    });
    return {
      ok: false,
      error: "AUTO_INTEGRATE_FAILED",
      taskId,
      reason: integrated.reason,
      detail: integrated.detail,
    };
  }

  task.status = "done";
  task.updatedAt = getIsoTime();
  addActivityEvent({
    id: issueTaskId("evt"),
    timestamp: task.updatedAt,
    type: "workflow",
    action: "task_done",
    detail: `${taskId} accepted -> merged -> done`,
  });
  return {
    ok: true,
    task,
    integration: {
      enabled: true,
      status: integrated.status,
      targetBranch: integrated.targetBranch,
      commit: integrated.commit,
    },
  };
};
