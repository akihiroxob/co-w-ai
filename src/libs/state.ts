import { CommandResult } from "../types/CommandResult";
import { Task } from "../types/Task";
import { ActivityEvent, AgentRoleProfile, StoryWorkflow } from "../types/StoryWorkflow";
import { appendActivityEvent } from "../utils/activityPersistence";
import { loadStateSnapshot, persistStateSnapshot } from "../utils/statePersistence";
import { getIsoTime } from "../utils/timeUtil";

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
  const timestamp = event.timestamp ?? event.ts ?? getIsoTime();
  const normalized: ActivityEvent = {
    ...event,
    timestamp,
    ts: event.ts ?? timestamp,
  };
  state.activityLog.push(normalized);
  if (state.activityLog.length > 500) {
    state.activityLog.splice(0, state.activityLog.length - 500);
  }
  void persistStateSnapshot(state);
  void appendActivityEvent(normalized);
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
