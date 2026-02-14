import { CommandResult } from "../types/CommandResult";
import { Task } from "../types/Task";
import { ActivityEvent, AgentRoleProfile, StoryWorkflow } from "../types/StoryWorkflow";

type AppState = {
  tasks: Task[];
  lastCommand: CommandResult | null;
  agentRoles: Record<string, AgentRoleProfile>;
  workflows: StoryWorkflow[];
  activityLog: ActivityEvent[];
};

export const state: AppState = {
  tasks: [] as Task[],
  lastCommand: null as CommandResult | null,
  agentRoles: {},
  workflows: [],
  activityLog: [],
};

export const findTask = (taskId: string): Task | undefined => {
  return state.tasks.find((t) => t.id === taskId);
};

export const findWorkflow = (workflowId: string): StoryWorkflow | undefined => {
  return state.workflows.find((w) => w.id === workflowId);
};

export const addActivityEvent = (event: ActivityEvent) => {
  state.activityLog.push(event);
  if (state.activityLog.length > 500) {
    state.activityLog.splice(0, state.activityLog.length - 500);
  }
};
