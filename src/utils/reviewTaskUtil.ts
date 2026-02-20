import { addActivityEvent, state } from "../libs/state";
import { issueTaskId } from "./idUtil";
import { getIsoTime } from "./timeUtil";
import type { Task } from "../types/Task";

const PM_ROLE_PATTERN = /(planning|pm|product manager)/i;
const TL_ROLE_PATTERN = /(tech lead|techlead|architect|\btl\b)/i;

export const findPmAgentId = (): string | undefined => {
  const entries = Object.entries(state.agentRoles);
  const explicitPm = entries.find(([, role]) => role.isPm === true);
  if (explicitPm) return explicitPm[0];
  const matched = entries.find(([, role]) => PM_ROLE_PATTERN.test(role.role));
  return matched?.[0];
};

export const findTechLeadAgentId = (): string | undefined => {
  const entries = Object.entries(state.agentRoles);
  const matched = entries.find(([, role]) => TL_ROLE_PATTERN.test(role.role));
  return matched?.[0];
};

const hasOpenReviewTask = (
  targetTaskId: string,
  reviewType: "tl_review" | "pm_review" | "tl_merge",
): boolean => {
  return state.tasks.some(
    (t) =>
      t.taskType === reviewType &&
      t.reviewTargetTaskId === targetTaskId &&
      (t.status === "todo" || t.status === "doing"),
  );
};

const queueReviewTask = (
  targetTask: Task,
  reviewType: "tl_review" | "pm_review" | "tl_merge",
  assignee: string,
): Task | undefined => {
  if (targetTask.taskType === "tl_review" || targetTask.taskType === "pm_review") return undefined;

  if (hasOpenReviewTask(targetTask.id, reviewType)) {
    return undefined;
  }

  const now = getIsoTime();
  const reviewTitlePrefix =
    reviewType === "tl_review"
      ? "[TechLead Review]"
      : reviewType === "pm_review"
        ? "[PM Review]"
        : "[TechLead Merge]";
  const reviewTask: Task = {
    id: issueTaskId("review"),
    title: `${reviewTitlePrefix} ${targetTask.title}`,
    description: `Review target=${targetTask.id}\n${targetTask.description ?? ""}`.trim(),
    status: "todo",
    taskType: reviewType,
    reviewTargetTaskId: targetTask.id,
    assignee,
    createdAt: now,
    updatedAt: now,
  };

  state.tasks.push(reviewTask);
  addActivityEvent({
    id: issueTaskId("evt"),
    timestamp: now,
    type: "workflow",
    action:
      reviewType === "tl_review"
        ? "tl_review_queued"
        : reviewType === "pm_review"
          ? "pm_review_queued"
          : "tl_merge_queued",
    detail: `${reviewTask.id} for ${targetTask.id} assigned to ${assignee}`,
    agentId: assignee,
  });

  return reviewTask;
};

export const queueTlReviewTask = (targetTask: Task): Task | undefined => {
  if (
    targetTask.taskType === "tl_review" ||
    targetTask.taskType === "pm_review" ||
    targetTask.taskType === "tl_merge"
  )
    return undefined;

  const tlAgentId = findTechLeadAgentId();
  if (!tlAgentId) {
    addActivityEvent({
      id: issueTaskId("evt"),
      timestamp: getIsoTime(),
      type: "system",
      action: "tl_review_queue_skipped",
      detail: `TechLead role not found for ${targetTask.id}`,
    });
    return undefined;
  }

  return queueReviewTask(targetTask, "tl_review", tlAgentId);
};

export const queuePmReviewTask = (targetTask: Task): Task | undefined => {
  if (
    targetTask.taskType === "tl_review" ||
    targetTask.taskType === "pm_review" ||
    targetTask.taskType === "tl_merge"
  )
    return undefined;

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

  return queueReviewTask(targetTask, "pm_review", pmAgentId);
};

export const queueTlMergeTask = (targetTask: Task): Task | undefined => {
  if (
    targetTask.taskType === "tl_review" ||
    targetTask.taskType === "pm_review" ||
    targetTask.taskType === "tl_merge"
  )
    return undefined;

  const tlAgentId = findTechLeadAgentId();
  if (!tlAgentId) {
    addActivityEvent({
      id: issueTaskId("evt"),
      timestamp: getIsoTime(),
      type: "system",
      action: "tl_merge_queue_skipped",
      detail: `TechLead role not found for ${targetTask.id}`,
    });
    return undefined;
  }

  return queueReviewTask(targetTask, "tl_merge", tlAgentId);
};
