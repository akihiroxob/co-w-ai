export { registerPingTool } from "./ping";
export { registerStatusTool } from "./status";
export { registerClaimTaskTool } from "./claimTask";
export { registerSubmitTaskTool } from "./submitTask";
export { registerAcceptTaskTool } from "./acceptTask";
export { registerRejectTaskTool } from "./rejectTask";
export { registerSpawnWorkerTool } from "./spawnWorker";
export { registerRequestStoryWorkflowTool } from "./requestStoryWorkflow";
export { registerActivityLogTool } from "./activityLog";
export { registerReportProgressTool } from "./reportProgress";

// Admin-only tools (kept in code, not registered by default):
// runCommand, applyPatch, verifyTask, cleanupWorktree, enqueueTask
