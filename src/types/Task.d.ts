export type TaskStatus =
  | "todo"
  | "doing"
  | "in_review"
  | "wait_accept"
  | "accepted"
  | "done"
  | "rejected";
export type Task = {
  id: string;
  workflowId?: string;
  title: string;
  description?: string;
  status: TaskStatus;
  assignee?: string; // "A", "B1", "B2", ...
  reworkRequested?: boolean;
  reworkReason?: string;
  reworkCount?: number;
  createdAt: string;
  updatedAt: string;
};
