import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { CommandResult } from "../types/CommandResult";
import { Task } from "../types/Task";
import { AgentRoleProfile, StoryWorkflow, ActivityEvent } from "../types/StoryWorkflow";

export type PersistedAppState = {
  tasks: Task[];
  lastCommand: CommandResult | null;
  agentRoles: Record<string, AgentRoleProfile>;
  workflows: StoryWorkflow[];
  activityLog: ActivityEvent[];
};

const resolveStateSnapshotPath = () => {
  const configured = process.env.COWAI_STATE_FILE;
  if (configured && configured.trim().length > 0) {
    return path.isAbsolute(configured) ? configured : path.resolve(process.cwd(), configured);
  }
  return path.join(process.cwd(), "logs", "state.json");
};

export const stateSnapshotFilePath = resolveStateSnapshotPath();

const normalize = (value: Partial<PersistedAppState> | null | undefined): PersistedAppState => {
  return {
    tasks: Array.isArray(value?.tasks) ? value.tasks : [],
    lastCommand: value?.lastCommand ?? null,
    agentRoles: value?.agentRoles ?? {},
    workflows: Array.isArray(value?.workflows) ? value.workflows : [],
    activityLog: Array.isArray(value?.activityLog) ? value.activityLog.slice(-500) : [],
  };
};

export const loadStateSnapshot = async (): Promise<PersistedAppState | null> => {
  try {
    const raw = await readFile(stateSnapshotFilePath, "utf8");
    const parsed = JSON.parse(raw) as Partial<PersistedAppState>;
    return normalize(parsed);
  } catch {
    return null;
  }
};

export const persistStateSnapshot = async (snapshot: PersistedAppState): Promise<void> => {
  try {
    await mkdir(path.dirname(stateSnapshotFilePath), { recursive: true });
    const tempPath = `${stateSnapshotFilePath}.tmp`;
    await writeFile(tempPath, JSON.stringify(normalize(snapshot)), "utf8");
    await rename(tempPath, stateSnapshotFilePath);
  } catch {
    // Keep persistence best-effort and non-fatal.
  }
};
