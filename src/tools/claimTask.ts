import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { addActivityEvent, findTask } from "../libs/state";
import { issueTaskId } from "../utils/idUtil";
import { getIsoTime } from "../utils/timeUtil";

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
      const task = findTask(taskId);
      if (!task) {
        return {
          content: [{ type: "text", text: `Task not found: ${taskId}` }],
          structuredContent: { ok: false, error: "TASK_NOT_FOUND", taskId },
          isError: true,
        };
      }

      if (task.status !== "todo") {
        return {
          content: [{ type: "text", text: `Task is not todo: ${taskId}` }],
          structuredContent: { ok: false, error: "INVALID_STATE", taskId, status: task.status },
          isError: true,
        };
      }

      if (task.assignee && task.assignee !== agentId) {
        return {
          content: [{ type: "text", text: `Task already assigned to ${task.assignee}` }],
          structuredContent: {
            ok: false,
            error: "ASSIGNEE_MISMATCH",
            taskId,
            assignee: task.assignee,
            requestedBy: agentId,
          },
          isError: true,
        };
      }

      task.assignee = agentId;
      task.status = "doing";
      task.updatedAt = getIsoTime();

      addActivityEvent({
        id: issueTaskId("evt"),
        timestamp: task.updatedAt,
        type: "workflow",
        action: "task_claimed",
        detail: `${taskId} claimed by ${agentId}`,
        agentId,
      });

      return {
        content: [{ type: "text", text: `Claimed: ${taskId} by ${agentId}` }],
        structuredContent: { ok: true, task },
      };
    },
  );
