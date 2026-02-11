import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { getIsoTime } from "../utils/timeUtil";
import { Task } from "../types/Task";
import { state } from "../libs/state";

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
        id: getIsoTime(),
        title,
        description,
        status: "todo",
        createdAt: ts,
        updatedAt: ts,
      };
      state.tasks.push(task);

      return {
        content: [{ type: "text", text: `Enqueued: ${task.id}` }],
        structuredContent: task,
      };
    },
  );
