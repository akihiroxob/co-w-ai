import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { addActivityEvent, state } from "../../libs/state";
import { getIsoTime } from "../../utils/timeUtil";
import { issueTaskId } from "../../utils/idUtil";
import { Task } from "../../types/Task";

export const registerEnqueueTaskTool = (server: McpServer) =>
  server.registerTool(
    "enqueueTask",
    {
      title: "enqueueTask",
      description: "Add a task to the orchestrator queue.",
      inputSchema: {
        title: z.string().min(1),
        description: z.string().optional(),
      },
    },
    async ({ title, description }) => {
      const ts = getIsoTime();
      const task: Task = {
        id: issueTaskId(),
        title,
        description,
        status: "todo",
        createdAt: ts,
        updatedAt: ts,
      };
      state.tasks.push(task);
      addActivityEvent({
        id: issueTaskId("evt"),
        timestamp: ts,
        type: "workflow",
        action: "task_enqueued",
        detail: `${task.id} enqueued: ${title}`,
      });

      return {
        content: [{ type: "text", text: `Enqueued: ${task.id}` }],
        structuredContent: task,
      };
    },
  );
