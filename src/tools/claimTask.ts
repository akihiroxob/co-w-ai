import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { claimTaskForAgent } from "../utils/taskClaimUtil";

export const registerClaimTaskTool = (server: McpServer) =>
  server.registerTool(
    "claimTask",
    {
      title: "claimTask",
      description: "Developer claims a backlog task (todo -> doing).",
      inputSchema: {
        taskId: z.string().min(1),
        agentId: z.string().min(1),
      },
    },
    async ({ taskId, agentId }) => {
      const result = await claimTaskForAgent(taskId, agentId);
      if (!result.ok) {
        if (result.error === "TASK_NOT_FOUND") {
          return {
            content: [{ type: "text", text: `Task not found: ${taskId}` }],
            structuredContent: { ok: false, error: "TASK_NOT_FOUND", taskId },
            isError: true,
          };
        }

        if (result.error === "INVALID_STATE") {
          return {
            content: [{ type: "text", text: `Task is not todo: ${taskId}` }],
            structuredContent: { ok: false, error: "INVALID_STATE", taskId, status: result.status },
            isError: true,
          };
        }

        if (result.error === "ASSIGNEE_MISMATCH") {
          return {
            content: [{ type: "text", text: `Task already assigned to ${result.assignee}` }],
            structuredContent: {
              ok: false,
              error: "ASSIGNEE_MISMATCH",
              taskId,
              assignee: result.assignee,
              requestedBy: agentId,
            },
            isError: true,
          };
        }

        if (result.error === "REWORK_PRIORITY_REQUIRED") {
          return {
            content: [
              {
                type: "text",
                text: `Rework task must be claimed first: ${result.prioritizedTaskId}`,
              },
            ],
            structuredContent: {
              ok: false,
              error: "REWORK_PRIORITY_REQUIRED",
              taskId,
              agentId,
              prioritizedTaskId: result.prioritizedTaskId,
            },
            isError: true,
          };
        }

        if (result.error === "WORKER_NOT_FOUND") {
          return {
            content: [{ type: "text", text: `Worker not found: ${agentId}` }],
            structuredContent: { ok: false, error: "WORKER_NOT_FOUND", agentId },
            isError: true,
          };
        }

        return {
          content: [{ type: "text", text: `worktree setup failed for ${taskId}` }],
          structuredContent: {
            ok: false,
            error: "WORKTREE_SETUP_FAILED",
            taskId,
            agentId,
            reason: result.reason,
            detail: result.detail,
          },
          isError: true,
        };
      }

      return {
        content: [{ type: "text", text: `Claimed: ${taskId} by ${agentId}` }],
        structuredContent: {
          ok: true,
          task: result.task,
          worktreePath: result.worktreePath,
          branch: result.branch,
        },
      };
    },
  );
