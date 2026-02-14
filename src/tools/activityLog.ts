import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { state } from "../libs/state";

export const registerActivityLogTool = (server: McpServer) =>
  server.registerTool(
    "activityLog",
    {
      title: "activityLog",
      description: "Inspect agent/system activity logs.",
      inputSchema: {
        workflowId: z.string().optional(),
        agentId: z.string().optional(),
        limit: z.number().int().min(1).max(200).default(50),
      },
    },
    async ({ workflowId, agentId, limit }) => {
      let events = state.activityLog;

      if (workflowId) {
        events = events.filter((e) => e.workflowId === workflowId);
      }
      if (agentId) {
        events = events.filter((e) => e.agentId === agentId);
      }

      const sliced = events.slice(Math.max(0, events.length - limit));

      return {
        content: [{ type: "text", text: `events=${sliced.length}` }],
        structuredContent: {
          count: sliced.length,
          events: sliced,
        },
      };
    },
  );
