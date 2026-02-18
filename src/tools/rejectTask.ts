import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { addActivityEvent, findTask, state } from "../libs/state";
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

      const relatedReviewTasks = state.tasks.filter(
        (t) =>
          t.taskType === "pm_review" &&
          t.reviewTargetTaskId === taskId &&
          (t.status === "todo" || t.status === "doing" || t.status === "wait_accept" || t.status === "blocked"),
      );
      for (const reviewTask of relatedReviewTasks) {
        reviewTask.status = "done";
        reviewTask.updatedAt = getIsoTime();
        addActivityEvent({
          id: issueTaskId("evt"),
          timestamp: reviewTask.updatedAt,
          type: "workflow",
          action: "pm_review_closed",
          detail: `${reviewTask.id} closed after reject ${taskId}`,
          agentId: reviewTask.assignee,
        });
      }

      return {
        content: [{ type: "text", text: `Rejected: ${taskId}` }],
        structuredContent: { ok: true, task, reason: reason.trim() },
      };
    },
  );
