import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { addActivityEvent, findTask } from "../libs/state";
import { issueTaskId } from "../utils/idUtil";
import { getIsoTime } from "../utils/timeUtil";

const findWorkflowIdByTaskId = (taskId: string): string | undefined => {
  const task = findTask(taskId);
  return task?.workflowId;
};

export const handleReportProgress = async ({
  taskId,
  agentId,
  message,
}: {
  taskId: string;
  agentId: string;
  message: string;
}) => {
  const task = findTask(taskId);
  if (!task) {
    return {
      content: [{ type: "text" as const, text: `Task not found: ${taskId}` }],
      structuredContent: { ok: false as const, error: "TASK_NOT_FOUND", taskId },
      isError: true,
    };
  }

  if (task.status !== "doing") {
    return {
      content: [{ type: "text" as const, text: `Task is not doing: ${taskId}` }],
      structuredContent: { ok: false as const, error: "INVALID_STATE", taskId, status: task.status },
      isError: true,
    };
  }

  if (!task.assignee || task.assignee !== agentId) {
    return {
      content: [{ type: "text" as const, text: `Task assignee mismatch: expected ${task.assignee}` }],
      structuredContent: {
        ok: false as const,
        error: "ASSIGNEE_MISMATCH",
        taskId,
        assignee: task.assignee,
        reportedBy: agentId,
      },
      isError: true,
    };
  }

  const trimmedMessage = message.trim();
  if (!trimmedMessage) {
    return {
      content: [{ type: "text" as const, text: "message must not be empty" }],
      structuredContent: { ok: false as const, error: "INVALID_MESSAGE", taskId },
      isError: true,
    };
  }

  const timestamp = getIsoTime();
  addActivityEvent({
    id: issueTaskId("evt"),
    timestamp,
    type: "agent",
    action: "worker_progress_reported",
    detail: `${taskId} ${trimmedMessage}`,
    agentId,
    workflowId: findWorkflowIdByTaskId(taskId),
  });

  task.updatedAt = timestamp;

  return {
    content: [{ type: "text" as const, text: `Progress reported: ${taskId}` }],
    structuredContent: {
      ok: true as const,
      taskId,
      agentId,
      message: trimmedMessage,
      timestamp,
    },
  };
};

export const registerReportProgressTool = (server: McpServer) =>
  server.registerTool(
    "reportProgress",
    {
      title: "reportProgress",
      description: "Worker reports task progress for long-running execution.",
      inputSchema: {
        taskId: z.string().min(1),
        agentId: z.string().min(1),
        message: z.string().min(1).max(500),
      },
    },
    async ({ taskId, agentId, message }) => handleReportProgress({ taskId, agentId, message }),
  );
