import { CommandResult } from "./CommandResult";
import { TaskStatus } from "./Task";

export type WorkflowStatus =
  | "planning"
  | "active"
  | "done";

export type AgentRoleProfile = {
  agentId: string;
  role: string;
  isPm?: boolean;
  focus?: string;
  personality?: string;
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
  runId?: string;
};
