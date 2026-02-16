import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { workers } from "../../libs/workers";
import { execCommandCapture } from "../../utils/shellUtil";
import { worktreePathFor, applyPatchInDir } from "../../utils/gitUtil";

export const registerApplyPatchTool = (server: McpServer) =>
  server.registerTool(
    "applyPatch",
    {
      title: "applyPatch",
      description:
        "Apply a unified diff patch via `git apply`. target=worktree is recommended for safety.",
      inputSchema: {
        agentId: z.string().min(1),
        taskId: z.string().min(1),
        patch: z.string().min(1),
        target: z.enum(["worktree", "repo"]).default("worktree"),
      },
    },
    async ({ agentId, taskId, patch, target }) => {
      const worker = workers.get(agentId);
      if (!worker) {
        return {
          content: [{ type: "text", text: `Worker not found: ${agentId}` }],
          structuredContent: { ok: false, error: "WORKER_NOT_FOUND", agentId },
          isError: true,
        };
      }

      const cwd = target === "repo" ? worker.repoPath : worktreePathFor(worker, agentId, taskId);

      const res = await applyPatchInDir(patch, cwd);

      const statusRes = await execCommandCapture("git status --porcelain=v1", cwd);

      return {
        content: [
          {
            type: "text",
            text: res.ok ? `Patch applied (${target})` : `Patch apply failed (${target})`,
          },
        ],
        structuredContent: {
          ok: res.ok,
          target,
          cwd,
          apply: res,
          gitStatus: statusRes.ok ? statusRes.stdout : statusRes.stderr,
        },
        isError: !res.ok,
      };
    },
  );
