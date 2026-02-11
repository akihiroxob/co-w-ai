import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

export const registerPingTool = (server: McpServer) =>
  server.registerTool(
    "ping",
    {
      title: "ping",
      description: "Health check. Returns 'pong' with optional message.",
      inputSchema: { message: z.string().optional() },
    },
    async ({ message }) => ({
      content: [{ type: "text", text: message ? `pong: ${message}` : "pong" }],
    }),
  );
