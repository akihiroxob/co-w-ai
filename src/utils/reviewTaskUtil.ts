import { addActivityEvent, state } from "../libs/state";
import { issueTaskId } from "./idUtil";
import { getIsoTime } from "./timeUtil";
import type { Task } from "../types/Task";

const PM_ROLE_PATTERN = /(planning|pm|product manager)/i;

export const findPmAgentId = (): string | undefined => {
  const entries = Object.entries(state.agentRoles);
  const explicitPm = entries.find(([, role]) => role.isPm === true);
  if (explicitPm) return explicitPm[0];
  const matched = entries.find(([, role]) => PM_ROLE_PATTERN.test(role.role));
  return matched?.[0];
};

const hasOpenReviewTask = (targetTaskId: string): boolean => {
  return state.tasks.some(
    (t) =>
      t.taskType === "pm_review" &&
      t.reviewTargetTaskId === targetTaskId &&
      (t.status === "todo" || t.status === "doing" || t.status === "blocked"),
  );
};

export const queuePmReviewTask = (targetTask: Task): Task | undefined => {
  if (targetTask.taskType === "pm_review") return undefined;

  const pmAgentId = findPmAgentId();
  if (!pmAgentId) {
    addActivityEvent({
      id: issueTaskId("evt"),
      timestamp: getIsoTime(),
      type: "system",
      action: "pm_review_queue_skipped",
      detail: `PM role not found for ${targetTask.id}`,
    });
    return undefined;
  }

  if (hasOpenReviewTask(targetTask.id)) {
    return undefined;
  }

  const now = getIsoTime();
  const reviewTask: Task = {
    id: issueTaskId("review"),
    title: `[PM Review] ${targetTask.title}`,
    description: `Review target=${targetTask.id}\n${targetTask.description ?? ""}`.trim(),
    status: "todo",
    taskType: "pm_review",
    reviewTargetTaskId: targetTask.id,
    assignee: pmAgentId,
    createdAt: now,
    updatedAt: now,
  };

  state.tasks.push(reviewTask);
  addActivityEvent({
    id: issueTaskId("evt"),
    timestamp: now,
    type: "workflow",
    action: "pm_review_queued",
    detail: `${reviewTask.id} for ${targetTask.id} assigned to ${pmAgentId}`,
    agentId: pmAgentId,
  });

  return reviewTask;
};
