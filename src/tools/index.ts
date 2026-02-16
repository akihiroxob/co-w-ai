export { registerPingTool } from "./ping";
export { registerEnqueueTaskTool } from "./enqueueTask";
export { registerStatusTool } from "./status";
export { registerAcceptTaskTool } from "./acceptTask";
export { registerSpawnWorkerTool } from "./spawnWorker";
export { registerStartRunWorkerTaskTool } from "./startRunWorkerTask";
export { registerGetRunStatusTool } from "./getRunStatus";
export { registerListRunsTool } from "./listRuns";
export { registerRunStoryWorkflowTool } from "./runStoryWorkflow";
export { registerActivityLogTool } from "./activityLog";

// Admin-only tools (kept in code, not registered by default):
// setTaskStatus, assignTask, runCommand, runWorkerTask, applyPatch, verifyTask, cleanupWorktree
