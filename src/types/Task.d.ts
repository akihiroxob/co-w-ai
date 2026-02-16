export type TaskStatus = "todo" | "doing" | "wait_accept" | "done" | "blocked";
export type Task = {
  id: string;
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
