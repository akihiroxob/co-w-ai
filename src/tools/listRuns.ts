import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { state } from "../libs/state";
import { RunStatus } from "../types/Run";

export const registerListRunsTool = (server: McpServer) =>
  server.registerTool(
    "listRuns",
    {
      title: "listRuns",
      description: "List asynchronous worker runs with optional filters.",
      inputSchema: {
        taskId: z.string().optional(),
        agentId: z.string().optional(),
        status: z.enum(["queued", "running", "succeeded", "failed", "canceled"]).optional(),
        limit: z.number().int().min(1).max(200).default(50),
      },
    },
    async ({ taskId, agentId, status, limit }) => {
      let runs = Object.values(state.runs);

      if (taskId) {
        runs = runs.filter((r) => r.taskId === taskId);
      }
      if (agentId) {
        runs = runs.filter((r) => r.agentId === agentId);
      }
      if (status) {
        runs = runs.filter((r) => r.status === (status as RunStatus));
      }

      runs.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
      const sliced = runs.slice(0, limit);

      return {
        content: [{ type: "text", text: `runs=${sliced.length}` }],
        structuredContent: {
          count: sliced.length,
          runs: sliced,
        },
      };
    },
  );
