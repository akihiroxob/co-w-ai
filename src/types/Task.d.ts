export type TaskStatus =
  | "todo"
  | "doing"
  | "in_review"
  | "wait_accept"
  | "accepted"
  | "done"
  | "rejected";
export type TaskType = "implementation" | "tl_review" | "pm_review" | "tl_merge";
export type Task = {
  id: string;
  workflowId?: string;
  title: string;
  description?: string;
  status: TaskStatus;
  taskType?: TaskType;
  reviewTargetTaskId?: string;
  assignee?: string; // "A", "B1", "B2", ...
  reworkRequested?: boolean;
  reworkReason?: string;
  reworkCount?: number;
  createdAt: string;
  updatedAt: string;
};
