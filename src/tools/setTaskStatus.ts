import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { findTask, state } from "../libs/state";
import { getIsoTime } from "../utils/timeUtil";

export const registerSetTaskStatusTool = (server: McpServer) =>
  server.registerTool(
    "setTaskStatus",
    {
      title: "setTaskStatus",
      description: "Update a task status. Allowed: todo/doing/review/done/blocked",
      inputSchema: {
        taskId: z.string().min(1),
        status: z.enum(["todo", "doing", "review", "done", "blocked"]),
      },
    },
    async ({ taskId, status }) => {
      const task = findTask(taskId);
      if (!task) {
        return {
          content: [{ type: "text", text: `Task not found: ${taskId}` }],
          structuredContent: { ok: false, error: "TASK_NOT_FOUND", taskId },
          isError: true,
        };
      }

      if (status === "done") {
        const meta = state.taskRunMeta[taskId];
        if (meta) {
          if (!meta.provenanceOk) {
            return {
              content: [{ type: "text", text: `Cannot set done: provenance missing for ${taskId}` }],
              structuredContent: { ok: false, error: "PROVENANCE_REQUIRED", taskId, meta },
              isError: true,
            };
          }

          if (meta.verifyRequired && !meta.verified) {
            return {
              content: [{ type: "text", text: `Cannot set done: verify is required for ${taskId}` }],
              structuredContent: { ok: false, error: "VERIFY_REQUIRED", taskId, meta },
              isError: true,
            };
          }
        }
      }

      task.status = status;
      task.updatedAt = getIsoTime();

      return {
        content: [{ type: "text", text: `Updated: ${taskId} -> ${status}` }],
        structuredContent: { ok: true, task },
      };
    },
  );
