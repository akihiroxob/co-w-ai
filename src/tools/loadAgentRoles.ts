import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { workers } from "../libs/workers";
import { addActivityEvent, state } from "../libs/state";
import { getIsoTime } from "../utils/timeUtil";
import { issueTaskId } from "../utils/idUtil";
import { applyAgentRoles, loadAgentRolesFromMarkdown } from "../utils/agentRoleUtil";

export const registerLoadAgentRolesTool = (server: McpServer) =>
  server.registerTool(
    "loadAgentRoles",
    {
      title: "loadAgentRoles",
      description:
        "Load agent roles from a markdown file (YAML frontmatter). default: <repo>/.agent/roles.md",
      inputSchema: {
        repoPath: z.string().optional(),
        filePath: z.string().optional(),
        replaceAll: z.boolean().default(false),
      },
    },
    async ({ repoPath, filePath, replaceAll }) => {
      const defaultRepoPath = repoPath ?? workers.values().next().value?.repoPath;
      if (!defaultRepoPath) {
        return {
          content: [{ type: "text", text: "repoPath is required when no worker is registered" }],
          structuredContent: { ok: false, error: "REPO_PATH_REQUIRED" },
          isError: true,
        };
      }

      try {
        const loaded = await loadAgentRolesFromMarkdown(defaultRepoPath, filePath);
        applyAgentRoles(loaded.roles, replaceAll);

        addActivityEvent({
          id: issueTaskId("evt"),
          timestamp: getIsoTime(),
          type: "system",
          action: "load_roles_md",
          detail: `loaded ${loaded.roles.length} role(s) from ${loaded.path}`,
        });

        return {
          content: [{ type: "text", text: `Loaded ${loaded.roles.length} role(s)` }],
          structuredContent: {
            ok: true,
            sourcePath: loaded.path,
            loaded: loaded.roles,
            agentRoles: state.agentRoles,
          },
        };
      } catch (e: any) {
        return {
          content: [{ type: "text", text: `failed to load roles: ${String(e?.message ?? e)}` }],
          structuredContent: { ok: false, error: "LOAD_ROLES_FAILED" },
          isError: true,
        };
      }
    },
  );
