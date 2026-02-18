import { CommandResult } from "../types/CommandResult";
import { Task } from "../types/Task";
import { ActivityEvent, AgentRoleProfile, StoryWorkflow } from "../types/StoryWorkflow";
import { appendActivityEvent } from "../utils/activityPersistence";
import { loadStateSnapshot, persistStateSnapshot } from "../utils/statePersistence";

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
  void persistStateSnapshot(state);
  void appendActivityEvent(event);
};

export const hydrateStateSnapshot = async () => {
  const loaded = await loadStateSnapshot();
  if (!loaded) return false;

  state.tasks = loaded.tasks;
  state.lastCommand = loaded.lastCommand;
  state.agentRoles = loaded.agentRoles;
  state.workflows = loaded.workflows;
  state.activityLog = loaded.activityLog;
  return true;
};
