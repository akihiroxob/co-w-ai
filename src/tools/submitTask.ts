import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { addActivityEvent, findTask } from "../libs/state";
import { workers } from "../libs/workers";
import { issueTaskId } from "../utils/idUtil";
import { getIsoTime } from "../utils/timeUtil";
import { validateTaskWorktree } from "../utils/gitUtil";

export const registerSubmitTaskTool = (server: McpServer) =>
  server.registerTool(
    "submitTask",
    {
      title: "submitTask",
      description: "Developer submits completed work for PM review (doing -> wait_accept).",
      inputSchema: {
        taskId: z.string().min(1),
        agentId: z.string().min(1),
        summary: z.string().optional(),
      },
    },
    async ({ taskId, agentId, summary }) => {
      const task = findTask(taskId);
      if (!task) {
        return {
          content: [{ type: "text", text: `Task not found: ${taskId}` }],
          structuredContent: { ok: false, error: "TASK_NOT_FOUND", taskId },
          isError: true,
        };
      }

      if (task.status !== "doing") {
        return {
          content: [{ type: "text", text: `Task is not doing: ${taskId}` }],
          structuredContent: { ok: false, error: "INVALID_STATE", taskId, status: task.status },
          isError: true,
        };
      }

      if (task.assignee && task.assignee !== agentId) {
        return {
          content: [{ type: "text", text: `Task assignee mismatch: expected ${task.assignee}` }],
          structuredContent: {
            ok: false,
            error: "ASSIGNEE_MISMATCH",
            taskId,
            assignee: task.assignee,
            submittedBy: agentId,
          },
          isError: true,
        };
      }

      const worker = workers.get(agentId);
      if (!worker) {
        return {
          content: [{ type: "text", text: `Worker not found: ${agentId}` }],
          structuredContent: { ok: false, error: "WORKER_NOT_FOUND", agentId },
          isError: true,
        };
      }

      const worktreeCheck = await validateTaskWorktree(worker, agentId, taskId);
      if (!worktreeCheck.ok) {
        return {
          content: [{ type: "text", text: `task worktree is required for submit: ${taskId}` }],
          structuredContent: {
            ok: false,
            error: "WORKTREE_REQUIRED",
            taskId,
            agentId,
            reason: worktreeCheck.error,
            detail: worktreeCheck.detail,
          },
          isError: true,
        };
      }

      task.assignee = agentId;
      task.status = "wait_accept";
      task.reworkRequested = false;
      task.reworkReason = undefined;
      task.updatedAt = getIsoTime();

      addActivityEvent({
        id: issueTaskId("evt"),
        timestamp: task.updatedAt,
        type: "workflow",
        action: "task_submitted",
        detail: `${taskId} submitted by ${agentId}${summary ? `: ${summary.trim()}` : ""}`,
        agentId,
      });

      return {
        content: [{ type: "text", text: `Submitted: ${taskId}` }],
        structuredContent: { ok: true, task, summary: summary?.trim() },
      };
    },
  );
