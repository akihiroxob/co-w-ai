import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { runShellCommand } from "../utils/shellUtil";
import { state } from "../libs/state.js";

export const registerRunCommandTool = (server: McpServer) =>
  server.registerTool(
    "runCommand",
    {
      title: "runCommand",
      description:
        "Run a shell command on the local machine. Returns stdout/stderr/exitCode. Use with care.",
      inputSchema: {
        command: z.string().min(1),
        cwd: z.string().optional(), // default: process.cwd()
      },
    },
    async ({ command, cwd }) => {
      const workdir = cwd ?? process.cwd();
      const result = await runShellCommand(command, workdir);
      state.lastCommand = result;

      return {
        content: [
          {
            type: "text",
            text: result.ok
              ? `OK (exit=0): ${result.command}`
              : `FAILED (exit=${result.exitCode}): ${result.command}`,
          },
        ],
        structuredContent: result,
        isError: !result.ok,
      };
    },
  );
