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
        runId: z.string().optional(),
        type: z.enum(["workflow", "agent", "system"]).optional(),
        action: z.string().optional(),
        contains: z.string().optional(),
        format: z.enum(["json", "lines"]).default("json"),
        limit: z.number().int().min(1).max(500).default(50),
      },
    },
    async ({ workflowId, agentId, runId, type, action, contains, format, limit }) => {
      let events = state.activityLog;

      if (workflowId) {
        events = events.filter((e) => e.workflowId === workflowId);
      }
      if (agentId) {
        events = events.filter((e) => e.agentId === agentId);
      }
      if (runId) {
        events = events.filter((e) => e.runId === runId);
      }
      if (type) {
        events = events.filter((e) => e.type === type);
      }
      if (action) {
        const actionFilter = action.toLowerCase();
        events = events.filter((e) => e.action.toLowerCase().includes(actionFilter));
      }
      if (contains) {
        const containsFilter = contains.toLowerCase();
        events = events.filter((e) => e.detail.toLowerCase().includes(containsFilter));
      }

      const sliced = events.slice(Math.max(0, events.length - limit));
      const lines =
        format === "lines"
          ? sliced.map(
              (e) =>
                `[${e.timestamp}] run=${e.runId ?? "-"} ${e.type} ${e.action} ${e.agentId ? `agent=${e.agentId} ` : ""}${e.workflowId ? `task=${e.workflowId} ` : ""}${e.detail}`,
            )
          : undefined;

      return {
        content: [
          {
            type: "text",
            text: format === "lines" ? lines?.join("\n") || "" : `events=${sliced.length}`,
          },
        ],
        structuredContent: {
          count: sliced.length,
          events: sliced,
          ...(format === "lines" ? { lines } : {}),
        },
      };
    },
  );
