export type TaskStatus = "todo" | "doing" | "review" | "done" | "blocked";
export type Task = {
  id: string;
  title: string;
  description?: string;
  status: TaskStatus;
  assignee?: string; // "A", "B1", "B2", ...
  createdAt: string;
  updatedAt: string;
};
