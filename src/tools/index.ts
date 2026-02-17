export { registerPingTool } from "./ping";
export { registerStatusTool } from "./status";
export { registerClaimTaskTool } from "./claimTask";
export { registerSubmitTaskTool } from "./submitTask";
export { registerAcceptTaskTool } from "./acceptTask";
export { registerRejectTaskTool } from "./rejectTask";
export { registerSpawnWorkerTool } from "./spawnWorker";
export { registerRunStoryWorkflowTool } from "./runStoryWorkflow";
export { registerActivityLogTool } from "./activityLog";
export { registerReloadConfigTool } from "./reloadConfig";

// Admin-only tools (kept in code, not registered by default):
// runCommand, applyPatch, verifyTask, cleanupWorktree, enqueueTask
