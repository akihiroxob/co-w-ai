import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { acceptTaskWithPolicy } from "../utils/acceptTaskUtil";

export const registerAcceptTaskTool = (server: McpServer) =>
  server.registerTool(
    "acceptTask",
    {
      title: "acceptTask",
      description:
        "Review acceptance step: in_review -> wait_accept (TL), wait_accept -> accepted (PM), accepted -> done (TL merge).",
      inputSchema: {
        taskId: z.string().min(1),
      },
    },
    async ({ taskId }) => {
      const result = await acceptTaskWithPolicy(taskId);
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
            content: [{ type: "text", text: `Task is not in_review/wait_accept/accepted: ${taskId}` }],
            structuredContent: { ok: false, error: "INVALID_STATE", taskId, status: result.status },
            isError: true,
          };
        }

        return {
          content: [{ type: "text", text: `Auto integration failed for: ${taskId}` }],
          structuredContent: {
            ok: false,
            error: "AUTO_INTEGRATE_FAILED",
            taskId,
            reason: result.reason,
            detail: result.detail,
          },
          isError: true,
        };
      }

      return {
        content: [{ type: "text", text: `Accepted: ${taskId}` }],
        structuredContent: { ok: true, task: result.task, integration: result.integration },
      };
    },
  );
