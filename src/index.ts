import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { addActivityEvent, hydrateStateSnapshot } from "./libs/state";
import { issueTaskId } from "./utils/idUtil";
import { getIsoTime } from "./utils/timeUtil";
import { preloadWorkersFromConfig } from "./utils/workerBootstrap";
import { startAutoClaimLoop } from "./utils/autoClaimLoop";
import { startWorkerExecutionLoop } from "./utils/workerExecutionLoop";
import { stateSnapshotFilePath } from "./utils/statePersistence";

// -------------------------
// Server
// -------------------------
const server = new McpServer({ name: "orchestrator", version: "0.5.2" });

// -------------------------
// Tools
// -------------------------
import {
  registerPingTool,
  registerStatusTool,
  registerRequestStoryWorkflowTool,
  registerClaimTaskTool,
  registerSubmitTaskTool,
  registerAcceptTaskTool,
  registerRejectTaskTool,
  registerSpawnWorkerTool,
  registerActivityLogTool,
  registerReportProgressTool,
} from "./tools";

registerPingTool(server);
registerStatusTool(server);
registerRequestStoryWorkflowTool(server);
registerClaimTaskTool(server);
registerSubmitTaskTool(server);
registerAcceptTaskTool(server);
registerRejectTaskTool(server);
registerSpawnWorkerTool(server);
registerActivityLogTool(server);
registerReportProgressTool(server);

async function preloadWorkers() {
  try {
    const loaded = await preloadWorkersFromConfig(process.cwd(), process.env.COWAI_WORKERS_FILE);
    addActivityEvent({
      id: issueTaskId("evt"),
      timestamp: getIsoTime(),
      type: "system",
      action: "preload_workers",
      detail: `loaded ${loaded.loaded.length} worker(s), ${loaded.loadedRoles.length} role profile(s) from ${loaded.path}`,
    });
    console.error(
      `Workers preloaded: ${loaded.loaded.length}, roles: ${loaded.loadedRoles.length} (${loaded.path})`,
    );
  } catch (e: any) {
    console.error(`Workers not preloaded: ${String(e?.message ?? e)}`);
  }
}

// -------------------------
// Main
// -------------------------
async function main() {
  console.error("MCP Orchestrator starting (stdio) ...");
  const hydrated = await hydrateStateSnapshot();
  if (hydrated) {
    console.error(`State snapshot loaded: ${stateSnapshotFilePath}`);
  }
  await preloadWorkers();
  const autoClaim = startAutoClaimLoop();
  if (autoClaim.enabled) {
    console.error(
      `Auto-claim loop enabled: interval=${autoClaim.intervalMs}ms, maxDoingPerAgent=${autoClaim.maxDoingPerAgent}`,
    );
  }
  const autoExec = startWorkerExecutionLoop();
  if (autoExec.enabled) {
    console.error(
      `Worker execution loop enabled: interval=${autoExec.intervalMs}ms, timeout=${autoExec.commandTimeoutMs}ms, autoVerify=${autoExec.autoVerify}, autoAccept=${autoExec.autoAccept}`,
    );
  }
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("MCP Orchestrator cowai has connected");
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
