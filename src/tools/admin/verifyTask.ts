import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { workers } from "../../libs/workers";
import { execCommandCapture } from "../../utils/shellUtil";
import { worktreePathFor } from "../../utils/gitUtil";
import { state } from "../../libs/state";
import { loadRepoPolicy } from "../../utils/policyUtil";
import { resolveCommandFromPolicy } from "../../utils/shellUtil";

export const registerVerifyTaskTool = (server: McpServer) =>
  server.registerTool(
    "verifyTask",
    {
      title: "verifyTask",
      description: "Run verification command defined in .agent/policy.yaml in the task worktree.",
      inputSchema: {
        agentId: z.string().min(1),
        taskId: z.string().min(1),
        commandKey: z.string().min(1), // e.g. "test"
      },
    },
    async ({ agentId, taskId, commandKey }) => {
      const worker = workers.get(agentId);
      if (!worker) {
        return {
          content: [{ type: "text", text: `Worker not found: ${agentId}` }],
          structuredContent: { ok: false, error: "WORKER_NOT_FOUND", agentId },
          isError: true,
        };
      }

      let policy;
      try {
        policy = await loadRepoPolicy(worker.repoPath);
      } catch (e: any) {
        return {
          content: [{ type: "text", text: `policy load failed: ${String(e?.message ?? e)}` }],
          structuredContent: { ok: false, error: "POLICY_LOAD_FAILED" },
          isError: true,
        };
      }

      let resolved;
      try {
        resolved = resolveCommandFromPolicy(policy, commandKey);
      } catch (e: any) {
        return {
          content: [{ type: "text", text: `command rejected: ${String(e?.message ?? e)}` }],
          structuredContent: { ok: false, error: "COMMAND_REJECTED" },
          isError: true,
        };
      }

      const cwd = worktreePathFor(worker, agentId, taskId);
      const res = await execCommandCapture(resolved.command, cwd);

      state.lastCommand = res;

      return {
        content: [
          {
            type: "text",
            text: res.ok ? `verify ok: ${commandKey}` : `verify failed: ${commandKey}`,
          },
        ],
        structuredContent: {
          ...res,
          commandKey,
          resolvedCommand: resolved.command,
        },
        isError: !res.ok,
      };
    },
  );
