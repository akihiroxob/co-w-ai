import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

// -------------------------
// Server
// -------------------------
const server = new McpServer({ name: "orchestrator", version: "0.2.0" });

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

// -------------------------
// Main
// -------------------------
async function main() {
  console.error("MCP Orchestrator starting (stdio) ...");
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("MCP Orchestrator connected");
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
