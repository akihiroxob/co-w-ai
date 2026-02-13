import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { runShellCommand } from "../utils/shellUtil";
import { state } from "../libs/state.js";
import { workers } from "../libs/workers";
import { loadRepoPolicy } from "../utils/policyUtil";
import { resolveCommandFromPolicy } from "../utils/shellUtil";
import { resolveCwdWithinRepo } from "../utils/gitUtil";

export const registerRunCommandTool = (server: McpServer) =>
  server.registerTool(
    "runCommand",
    {
      title: "runCommand",
      description: "Run a policy-defined command in the worker's repo (or subdir).",
      inputSchema: {
        agentId: z.string().min(1),
        commandKey: z.string().min(1),
        cwd: z.string().optional(),
      },
    },
    async ({ agentId, commandKey, cwd }) => {
      const worker = workers.get(agentId);
      if (!worker) {
        return {
          content: [{ type: "text", text: `Worker not found: ${agentId}` }],
          structuredContent: { ok: false, error: "WORKER_NOT_FOUND" },
          isError: true,
        };
      }

      const policy = await loadRepoPolicy(worker.repoPath);

      let resolved;
      try {
        resolved = resolveCommandFromPolicy(policy, commandKey);
      } catch (e: any) {
        return {
          content: [{ type: "text", text: `command rejected` }],
          structuredContent: { ok: false, error: "COMMAND_REJECTED" },
          isError: true,
        };
      }

      let workdir;
      try {
        workdir = resolveCwdWithinRepo(worker.repoPath, cwd);
      } catch (e: any) {
        return {
          content: [{ type: "text", text: `cwd rejected` }],
          structuredContent: { ok: false, error: "CWD_REJECTED" },
          isError: true,
        };
      }

      const result = await runShellCommand(resolved.command, workdir);
      state.lastCommand = result;

      return {
        content: [{ type: "text", text: result.ok ? "OK" : "FAILED" }],
        structuredContent: {
          ...result,
          commandKey,
          resolvedCommand: resolved.command,
        },
        isError: !result.ok,
      };
    },
  );
