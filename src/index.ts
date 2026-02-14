import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { applyAgentRoles, loadDefaultAgentRoles } from "./utils/agentRoleUtil";
import { addActivityEvent } from "./libs/state";
import { issueTaskId } from "./utils/idUtil";
import { getIsoTime } from "./utils/timeUtil";

// -------------------------
// Server
// -------------------------
const server = new McpServer({ name: "orchestrator", version: "0.3.1" });

// -------------------------
// Tools
// -------------------------
import {
  registerPingTool,
  registerEnqueueTaskTool,
  registerStatusTool,
  registerSetTaskStatusTool,
  registerAssignTaskTool,
  registerRunCommandTool,
  registerSpawnWorkerTool,
  registerRunWorkerTaskTool,
  registerApplyPatchTool,
  registerVerifyTaskTool,
  registerCleanupWorktreeTool,
  registerLoadAgentRolesTool,
  registerRunStoryWorkflowTool,
  registerActivityLogTool,
} from "./tools";

registerPingTool(server);
registerEnqueueTaskTool(server);
registerStatusTool(server);
registerSetTaskStatusTool(server);
registerAssignTaskTool(server);
registerRunCommandTool(server);
registerSpawnWorkerTool(server);
registerRunWorkerTaskTool(server);
registerApplyPatchTool(server);
registerVerifyTaskTool(server);
registerCleanupWorktreeTool(server);
registerLoadAgentRolesTool(server);
registerRunStoryWorkflowTool(server);
registerActivityLogTool(server);

async function preloadDefaultRoles() {
  try {
    const loaded = await loadDefaultAgentRoles(
      process.cwd(),
      process.env.COWAI_DEFAULT_ROLES_FILE,
    );
    applyAgentRoles(loaded.roles, false);
    addActivityEvent({
      id: issueTaskId("evt"),
      timestamp: getIsoTime(),
      type: "system",
      action: "load_roles_default",
      detail: `loaded ${loaded.roles.length} role(s) from ${loaded.path}`,
    });
    console.error(`Default roles loaded: ${loaded.roles.length} (${loaded.path})`);
  } catch (e: any) {
    console.error(`Default roles not loaded: ${String(e?.message ?? e)}`);
  }
}

// -------------------------
// Main
// -------------------------
async function main() {
  console.error("MCP Orchestrator starting (stdio) ...");
  await preloadDefaultRoles();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("MCP Orchestrator connected");
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
