import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { addActivityEvent, findTask, state } from "../libs/state";
import { issueTaskId } from "../utils/idUtil";
import { getIsoTime } from "../utils/timeUtil";

export const registerAcceptTaskTool = (server: McpServer) =>
  server.registerTool(
    "acceptTask",
    {
      title: "acceptTask",
      description: "Planning acceptance step: move task from wait_accept to done.",
      inputSchema: {
        taskId: z.string().min(1),
      },
    },
    async ({ taskId }) => {
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

      task.status = "done";
      task.updatedAt = getIsoTime();
      addActivityEvent({
        id: issueTaskId("evt"),
        timestamp: task.updatedAt,
        type: "workflow",
        action: "planning_accept_task",
        detail: `${taskId} accepted`,
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
          detail: `${reviewTask.id} closed after accept ${taskId}`,
          agentId: reviewTask.assignee,
        });
      }

      return {
        content: [{ type: "text", text: `Accepted: ${taskId}` }],
        structuredContent: { ok: true, task },
      };
    },
  );
