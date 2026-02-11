import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { workers } from "../libs/workers";
import { execCommandCapture } from "../utils/shellUtil";
import { worktreePathFor } from "../utils/gitUtil";
import { state } from "../libs/state";

export const registerVerifyTaskTool = (server: McpServer) =>
  server.registerTool(
    "verifyTask",
    {
      title: "verifyTask",
      description:
        "Run verification command (tests/lint/typecheck) in the task worktree. Returns logs.",
      inputSchema: {
        agentId: z.string().min(1),
        taskId: z.string().min(1),
        command: z.string().min(1), // e.g. "pnpm test"
      },
    },
    async ({ agentId, taskId, command }) => {
      const worker = workers.get(agentId);
      if (!worker) {
        return {
          content: [{ type: "text", text: `Worker not found: ${agentId}` }],
          structuredContent: { ok: false, error: "WORKER_NOT_FOUND", agentId },
          isError: true,
        };
      }

      const cwd = worktreePathFor(worker, agentId, taskId);
      const res = await execCommandCapture(command, cwd);
      state.lastCommand = res;

      return {
        content: [{ type: "text", text: res.ok ? "verify ok" : "verify failed" }],
        structuredContent: res,
        isError: !res.ok,
      };
    },
  );
