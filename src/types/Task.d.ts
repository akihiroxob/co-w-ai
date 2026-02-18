export type TaskStatus = "todo" | "doing" | "wait_accept" | "done" | "blocked";
export type TaskType = "implementation" | "pm_review";
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
