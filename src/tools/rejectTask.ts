import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { addActivityEvent, findTask } from "../libs/state";
import { issueTaskId } from "../utils/idUtil";
import { getIsoTime } from "../utils/timeUtil";

export const registerRejectTaskTool = (server: McpServer) =>
  server.registerTool(
    "rejectTask",
    {
      title: "rejectTask",
      description: "Review rejection step: move task from in_review/wait_accept/accepted to rejected.",
      inputSchema: {
        taskId: z.string().min(1),
        reason: z.string().min(1),
      },
    },
    async ({ taskId, reason }) => {
      const task = findTask(taskId);
      if (!task) {
        return {
          content: [{ type: "text", text: `Task not found: ${taskId}` }],
          structuredContent: { ok: false, error: "TASK_NOT_FOUND", taskId },
          isError: true,
        };
      }

      if (task.status !== "in_review" && task.status !== "wait_accept" && task.status !== "accepted") {
        return {
          content: [{ type: "text", text: `Task is not in_review/wait_accept/accepted: ${taskId}` }],
          structuredContent: { ok: false, error: "INVALID_STATE", taskId, status: task.status },
          isError: true,
        };
      }

      task.status = "rejected";
      task.reworkRequested = true;
      task.reworkReason = reason.trim();
      task.reworkCount = (task.reworkCount ?? 0) + 1;
      task.updatedAt = getIsoTime();

      addActivityEvent({
        id: issueTaskId("evt"),
        timestamp: task.updatedAt,
        type: "workflow",
        action: "planning_reject_task",
        detail: `${taskId} rejected: ${reason.trim()}`,
      });

      return {
        content: [{ type: "text", text: `Rejected: ${taskId}` }],
        structuredContent: { ok: true, task, reason: reason.trim() },
      };
    },
  );
