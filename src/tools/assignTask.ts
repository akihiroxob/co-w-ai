import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { findTask } from "../libs/state.js";
import { getIsoTime } from "../utils/timeUtil.js";

export const registerAssignTaskTool = (server: McpServer) => {
  server.registerTool(
    "assignTask",
    {
      title: "assignTask",
      description: "Assign a task to an agent id (e.g., A, B1, B2).",
      inputSchema: {
        taskId: z.string().min(1),
        assignee: z.string().min(1),
      },
    },
    async ({ taskId, assignee }) => {
      const task = findTask(taskId);
      if (!task) {
        return {
          content: [{ type: "text", text: `Task not found: ${taskId}` }],
          structuredContent: { ok: false, error: "TASK_NOT_FOUND", taskId },
          isError: true,
        };
      }

      task.assignee = assignee;
      task.updatedAt = getIsoTime();

      return {
        content: [{ type: "text", text: `Assigned: ${taskId} -> ${assignee}` }],
        structuredContent: { ok: true, task },
      };
    },
  );
};
