import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { workers } from "../../libs/workers";
import { execCommandCapture } from "../../utils/shellUtil";
import { taskBranchName, worktreePathFor } from "../../utils/gitUtil";
import { mkdir, rm } from "node:fs/promises";
import path from "node:path";
import { addActivityEvent } from "../../libs/state";
import { issueTaskId } from "../../utils/idUtil";
import { getIsoTime } from "../../utils/timeUtil";

export const registerCleanupWorktreeTool = (server: McpServer) =>
  server.registerTool(
    "cleanupWorktree",
    {
      title: "cleanupWorktree",
      description: "Remove git worktree for the given agent/task. Optionally delete branch.",
      inputSchema: {
        agentId: z.string().min(1),
        taskId: z.string().min(1),
        force: z.boolean().optional(),
        deleteBranch: z.boolean().default(false),
        archiveBeforeForce: z.boolean().default(false),
      },
    },
    async ({ agentId, taskId, force, deleteBranch, archiveBeforeForce }) => {
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
      const branch = taskBranchName(agentId, taskId);

      let archivePath: string | null = null;
      if (force && archiveBeforeForce) {
        try {
          const archiveDir = path.join(worker.worktreeRoot, "_archives");
          await mkdir(archiveDir, { recursive: true });
          const patchPath = path.join(archiveDir, `${agentId}__${taskId}__${Date.now()}.diff`);
          await execCommandCapture(`git diff > "${patchPath}"`, wtPath);
          const stagedPath = path.join(archiveDir, `${agentId}__${taskId}__${Date.now()}__staged.diff`);
          await execCommandCapture(`git diff --staged > "${stagedPath}"`, wtPath);
          const statusPath = path.join(archiveDir, `${agentId}__${taskId}__${Date.now()}__status.txt`);
          await execCommandCapture(`git status --porcelain=v1 > "${statusPath}"`, wtPath);
          archivePath = patchPath;

          addActivityEvent({
            id: issueTaskId("evt"),
            timestamp: getIsoTime(),
            type: "system",
            action: "cleanup_archive_created",
            detail: `archive=${patchPath}`,
            agentId,
            workflowId: taskId,
          });
        } catch {
          // best effort archive
        }
      }

      const remove = await execCommandCapture(
        `git worktree remove ${force ? "--force " : ""}"${wtPath}"`,
        repo,
      );

      try {
        await rm(wtPath, { recursive: true, force: true });
      } catch {
        // ignore
      }

      let branchDelete = null;
      if (deleteBranch) {
        branchDelete = await execCommandCapture(
          `git branch ${force ? "-D" : "-d"} "${branch}"`,
          repo,
        );
      }

      addActivityEvent({
        id: issueTaskId("evt"),
        timestamp: getIsoTime(),
        type: "system",
        action: "cleanup_complete",
        detail: `worktree=${remove.ok} branchDelete=${branchDelete ? branchDelete.ok : "skip"}`,
        agentId,
        workflowId: taskId,
      });

      return {
        content: [
          {
            type: "text",
            text: remove.ok ? "worktree removed" : "worktree remove failed",
          },
        ],
        structuredContent: {
          ok: remove.ok,
          worktreePath: wtPath,
          branch,
          archivePath,
          remove,
          branchDelete,
          warning:
            force && !archiveBeforeForce
              ? "force cleanup may discard uncommitted state"
              : undefined,
        },
        isError: !remove.ok,
      };
    },
  );
