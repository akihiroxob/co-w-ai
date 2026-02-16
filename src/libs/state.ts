import { CommandResult } from "../types/CommandResult";
import { Task } from "../types/Task";
import { ActivityEvent, AgentRoleProfile, StoryWorkflow } from "../types/StoryWorkflow";
import { appendActivityEvent } from "../utils/activityPersistence";
import { RunRecord } from "../types/Run";

export type TaskRunMeta = {
  taskId: string;
  agentId?: string;
  worktreePath?: string;
  branch?: string;
  baseBranch?: string;
  diffLength?: number;
  provenanceOk: boolean;
  verifyRequired: boolean;
  verifyCommandKey?: string;
  verified: boolean;
  lastRunAt: string;
};

type AppState = {
  tasks: Task[];
  lastCommand: CommandResult | null;
  agentRoles: Record<string, AgentRoleProfile>;
  workflows: StoryWorkflow[];
  activityLog: ActivityEvent[];
  taskRunMeta: Record<string, TaskRunMeta>;
  runs: Record<string, RunRecord>;
};

export const state: AppState = {
  tasks: [] as Task[],
  lastCommand: null as CommandResult | null,
  agentRoles: {},
  workflows: [],
  activityLog: [],
  taskRunMeta: {},
  runs: {},
};

export const findTask = (taskId: string): Task | undefined => {
  return state.tasks.find((t) => t.id === taskId);
};

export const findWorkflow = (workflowId: string): StoryWorkflow | undefined => {
  return state.workflows.find((w) => w.id === workflowId);
};

export const findRun = (runId: string): RunRecord | undefined => {
  return state.runs[runId];
};

export const addActivityEvent = (event: ActivityEvent) => {
  state.activityLog.push(event);
  if (state.activityLog.length > 500) {
    state.activityLog.splice(0, state.activityLog.length - 500);
  }
  void appendActivityEvent(event);
};
