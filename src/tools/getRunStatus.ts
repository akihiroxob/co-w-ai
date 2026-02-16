import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { findRun } from "../libs/state";

export const registerGetRunStatusTool = (server: McpServer) =>
  server.registerTool(
    "getRunStatus",
    {
      title: "getRunStatus",
      description: "Get asynchronous worker run status by runId.",
      inputSchema: {
        runId: z.string().min(1),
      },
    },
    async ({ runId }) => {
      const run = findRun(runId);
      if (!run) {
        return {
          content: [{ type: "text", text: `Run not found: ${runId}` }],
          structuredContent: { ok: false, error: "RUN_NOT_FOUND", runId },
          isError: true,
        };
      }

      return {
        content: [{ type: "text", text: `${runId}: ${run.status}` }],
        structuredContent: {
          ok: true,
          run,
        },
      };
    },
  );
