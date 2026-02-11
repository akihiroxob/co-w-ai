import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { workers } from "../libs/workers";
import { execCommandCapture } from "../utils/shellUtil";
import { worktreePathFor } from "../utils/gitUtil";
import { rm } from "node:fs/promises";

export const registerCleanupWorktreeTool = (server: McpServer) =>
  server.registerTool(
    "cleanupWorktree",
    {
      title: "cleanupWorktree",
      description: "Remove git worktree for the given agent/task. (Does not delete branch in MVP.)",
      inputSchema: {
        agentId: z.string().min(1),
        taskId: z.string().min(1),
        force: z.boolean().optional(), // default false
      },
    },
    async ({ agentId, taskId, force }) => {
      const worker = workers.get(agentId);
      if (!worker) {
        return {
          content: [{ type: "text", text: `Worker not found: ${agentId}` }],
          structuredContent: { ok: false, error: "WORKER_NOT_FOUND", agentId },
          isError: true,
        };
      }

      const repo = worker.repoPath;
      const wtPath = worktreePathFor(worker, agentId, taskId);

      // git worktree remove <path>
      const remove = await execCommandCapture(
        `git worktree remove ${force ? "--force " : ""}"${wtPath}"`,
        repo,
      );

      // 念のためディレクトリが残ってたら消す（best effort）
      try {
        await rm(wtPath, { recursive: true, force: true });
      } catch {
        // ignore
      }

      return {
        content: [
          { type: "text", text: remove.ok ? "worktree removed" : "worktree remove failed" },
        ],
        structuredContent: { ok: remove.ok, worktreePath: wtPath, remove },
        isError: !remove.ok,
      };
    },
  );
