import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import path from "node:path";
import { workers } from "../libs/workers";
import { execCommandCapture } from "../utils/shellUtil";
import { safeBranchName } from "../utils/gitUtil";
import { CommandResult } from "../types/CommandResult";
import { ensureDir } from "../utils/fsUtil";

export const registerRunWorkerTaskTool = (server: McpServer) =>
  server.registerTool(
    "runWorkerTask",
    {
      title: "runWorkerTask",
      description:
        "Create a git worktree for the task, run Codex in that worktree, then return unified diff via `git diff`.",
      inputSchema: {
        agentId: z.string().min(1),
        taskId: z.string().min(1),
        prompt: z.string().min(1),
        baseBranch: z.string().optional(), // default "main"
        // optional: run tests after codex (MVP off by default)
        runAfterCommand: z.string().optional(), // e.g. "pnpm test"
      },
    },
    async ({ agentId, taskId, prompt, baseBranch, runAfterCommand }) => {
      const worker = workers.get(agentId);
      if (!worker) {
        return {
          content: [{ type: "text", text: `Worker not found: ${agentId}` }],
          structuredContent: { ok: false, error: "WORKER_NOT_FOUND", agentId },
          isError: true,
        };
      }

      const repo = worker.repoPath;
      const base = baseBranch ?? "main";

      // Worktree path + branch
      const branch = `agent/${agentId}/${safeBranchName(taskId)}`;
      const wtPath = path.join(worker.worktreeRoot, `${agentId}__${safeBranchName(taskId)}`);

      // 1) ensure repo is a git repo (light check)
      const revParse = await execCommandCapture("git rev-parse --is-inside-work-tree", repo);
      if (!revParse.ok) {
        return {
          content: [{ type: "text", text: `Not a git repo? ${repo}` }],
          structuredContent: { ok: false, error: "NOT_GIT_REPO", repo, details: revParse },
          isError: true,
        };
      }

      // 2) fetch base branch existence (best effort)
      //    (MVP: no fetch/pull; you can add later)
      await ensureDir(worker.worktreeRoot);

      // 3) create worktree if missing
      // If worktree already exists, skip add.
      const wtList = await execCommandCapture("git worktree list --porcelain", repo);
      const already = wtList.ok && wtList.stdout.includes(`worktree ${wtPath}`);

      if (!already) {
        // Create new branch from base
        // git worktree add -b <branch> <path> <base>
        const add = await execCommandCapture(
          `git worktree add -b ${branch} "${wtPath}" ${base}`,
          repo,
        );
        if (!add.ok) {
          return {
            content: [{ type: "text", text: `Failed to create worktree: ${wtPath}` }],
            structuredContent: { ok: false, error: "WORKTREE_ADD_FAILED", add },
            isError: true,
          };
        }
      }

      // 4) run Codex in worktree
      // NOTE: codex exec <prompt> 形式を想定（必要ならここはあなたの実環境に合わせて変更）
      const codexCmd = `${worker.codexCmd} exec ${JSON.stringify(prompt)}`;
      const codexRes = await execCommandCapture(codexCmd, wtPath);

      // 5) optional post command (tests/lint)
      let after: CommandResult | null = null;
      if (runAfterCommand) {
        after = await execCommandCapture(runAfterCommand, wtPath);
      }

      // 6) collect diff (unified)
      // In worktree dir, `git diff` is enough; if codex staged changes you might want `git diff --staged` too.
      const diffRes = await execCommandCapture("git diff", wtPath);
      const statusRes = await execCommandCapture("git status --porcelain=v1", wtPath);

      const payload = {
        ok: codexRes.ok,
        agentId,
        taskId,
        repo,
        worktreePath: wtPath,
        branch,
        codex: codexRes,
        after,
        git: {
          status: statusRes.ok ? statusRes.stdout : "",
          diff: diffRes.ok ? diffRes.stdout : "",
        },
      };

      return {
        content: [
          {
            type: "text",
            text: codexRes.ok
              ? `Codex done. Diff length=${payload.git.diff.length}`
              : `Codex failed. See structuredContent.codex.stderr`,
          },
        ],
        structuredContent: payload,
        isError: !codexRes.ok,
      };
    },
  );
