import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { TaskStatus } from "../types/Task.js";
import { state } from "../libs/state.js";

export const registerStatusTool = (server: McpServer) =>
  server.registerTool(
    "status",
    {
      title: "status",
      description: "Get current orchestrator status (summary + tasks + lastCommand).",
      inputSchema: {},
    },
    async () => {
      const summary = state.tasks.reduce<Record<TaskStatus, number>>(
        (acc, t) => {
          acc[t.status] = (acc[t.status] ?? 0) + 1;
          return acc;
        },
        { todo: 0, doing: 0, review: 0, done: 0, blocked: 0 },
      );

      const payload = {
        summary,
        tasks: state.tasks,
        lastCommand: state.lastCommand,
      };

      return {
        content: [{ type: "text", text: "ok" }],
        structuredContent: payload,
      };
    },
  );
