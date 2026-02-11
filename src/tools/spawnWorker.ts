import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import path from "node:path";
import { z } from "zod";
import { ensureDir } from "../utils/fsUtil";
import { Worker } from "../types/Worker";
import { workers } from "../libs/workers";

export const registerSpawnWorkerTool = (server: McpServer) =>
  server.registerTool(
    "spawnWorker",
    {
      title: "spawnWorker",
      description:
        "Register a worker agent bound to a git repository. This does not start a persistent process; it stores config for later runWorkerTask().",
      inputSchema: {
        agentId: z.string().min(1), // "B1"
        repoPath: z.string().min(1), // "/path/to/repo"
        worktreeDirName: z.string().optional(), // default ".worktrees"
        codexCmd: z.string().optional(), // default env CODEX_CMD or "codex"
      },
    },
    async ({ agentId, repoPath, worktreeDirName, codexCmd }) => {
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

      return {
        content: [{ type: "text", text: `Worker registered: ${agentId}` }],
        structuredContent: worker,
      };
    },
  );
