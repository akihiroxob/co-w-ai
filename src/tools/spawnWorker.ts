import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import path from "node:path";
import { z } from "zod";
import { ensureDir } from "../utils/fsUtil";
import { Worker } from "../types/Worker";
import { workers } from "../libs/workers";
import { applyAgentRoles } from "../utils/agentRoleUtil";

export const registerSpawnWorkerTool = (server: McpServer) =>
  server.registerTool(
    "spawnWorker",
    {
      title: "spawnWorker",
      description:
        "Register a worker agent bound to a git repository. Preferred source is settings/workers.yaml at startup.",
      inputSchema: {
        agentId: z.string().min(1),
        repoPath: z.string().min(1),
        worktreeDirName: z.string().optional(),
        codexCmd: z.string().optional(),
        role: z.string().optional(),
        focus: z.string().optional(),
        personality: z.string().optional(),
        verifyCommandKey: z.string().optional(),
      },
    },
    async ({ agentId, repoPath, worktreeDirName, codexCmd, role, focus, personality, verifyCommandKey }) => {
      const absRepo = path.isAbsolute(repoPath) ? repoPath : path.resolve(process.cwd(), repoPath);
      const wtRoot = path.join(absRepo, worktreeDirName ?? ".worktrees");

      const worker: Worker = {
        agentId,
        repoPath: absRepo,
        worktreeRoot: wtRoot,
        codexCmd: codexCmd ?? process.env.CODEX_CMD ?? "codex",
      };

      await ensureDir(worker.worktreeRoot);
      workers.set(agentId, worker);

      if (role) {
        applyAgentRoles(
          [
            {
              agentId,
              role,
              focus,
              personality,
              verifyCommandKey,
            },
          ],
          false,
        );
      }

      return {
        content: [{ type: "text", text: `Worker registered: ${agentId}` }],
        structuredContent: {
          ...worker,
          roleProfileApplied: Boolean(role),
        },
      };
    },
  );
