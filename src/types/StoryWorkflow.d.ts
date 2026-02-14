import { CommandResult } from "./CommandResult";
import { TaskStatus } from "./Task";

export type WorkflowStatus =
  | "awaiting_user"
  | "ready"
  | "executing"
  | "verified"
  | "reported"
  | "blocked";

export type AgentRoleProfile = {
  agentId: string;
  role: string;
  focus?: string;
  verifyCommandKey?: string;
};

export type StoryQuestion = {
  id: string;
  question: string;
  answer?: string;
};

export type WorkflowTask = {
  taskId: string;
  title: string;
  description: string;
  assignee?: string;
  status: TaskStatus;
  commandResult?: CommandResult;
  verifyResult?: CommandResult;
  notes?: string;
};

export type StoryWorkflow = {
  id: string;
  story: string;
  status: WorkflowStatus;
  createdAt: string;
  updatedAt: string;
  questions: StoryQuestion[];
  tasks: WorkflowTask[];
  report?: string;
};

export type ActivityEventType = "workflow" | "agent" | "system";

export type ActivityEvent = {
  id: string;
  timestamp: string;
  type: ActivityEventType;
  action: string;
  detail: string;
  workflowId?: string;
  agentId?: string;
};
