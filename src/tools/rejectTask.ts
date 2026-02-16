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
      description: "Planning rejection step: move task from wait_accept back to todo.",
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

      if (task.status !== "wait_accept") {
        return {
          content: [{ type: "text", text: `Task is not wait_accept: ${taskId}` }],
          structuredContent: { ok: false, error: "INVALID_STATE", taskId, status: task.status },
          isError: true,
        };
      }

      task.status = "todo";
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
