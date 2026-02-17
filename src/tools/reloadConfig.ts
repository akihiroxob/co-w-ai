import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { workers } from "../libs/workers";
import { policyCache } from "../libs/policyCache";
import { state, addActivityEvent } from "../libs/state";
import { preloadWorkersFromConfig } from "../utils/workerBootstrap";
import { issueTaskId } from "../utils/idUtil";
import { getIsoTime } from "../utils/timeUtil";

export const registerReloadConfigTool = (server: McpServer) =>
  server.registerTool(
    "reloadConfig",
    {
      title: "reloadConfig",
      description:
        "Reload workers/roles config and clear runtime caches without restarting the MCP server.",
      inputSchema: {
        workersFile: z.string().optional(),
        resetWorkers: z.boolean().default(true),
        resetRoles: z.boolean().default(true),
        clearPolicyCache: z.boolean().default(true),
      },
    },
    async ({ workersFile, resetWorkers, resetRoles, clearPolicyCache }) => {
      const now = getIsoTime();

      const beforeWorkers = workers.size;
      const beforeRoles = Object.keys(state.agentRoles).length;
      const beforePolicyCache = policyCache.size;

      if (resetWorkers) {
        workers.clear();
      }
      if (resetRoles) {
        state.agentRoles = {};
      }
      if (clearPolicyCache) {
        policyCache.clear();
      }

      try {
        const loaded = await preloadWorkersFromConfig(process.cwd(), workersFile);
        const result = {
          ok: true,
          path: loaded.path,
          workers: {
            before: beforeWorkers,
            after: workers.size,
          },
          roles: {
            before: beforeRoles,
            after: Object.keys(state.agentRoles).length,
          },
          policyCache: {
            before: beforePolicyCache,
            after: policyCache.size,
          },
        };

        addActivityEvent({
          id: issueTaskId("evt"),
          timestamp: now,
          type: "system",
          action: "config_reloaded",
          detail: `workers=${result.workers.after}, roles=${result.roles.after}, policyCacheCleared=${clearPolicyCache}`,
        });

        return {
          content: [
            {
              type: "text",
              text: `config reloaded: workers=${result.workers.after}, roles=${result.roles.after}`,
            },
          ],
          structuredContent: result,
        };
      } catch (e: any) {
        return {
          content: [{ type: "text", text: `reload failed: ${String(e?.message ?? e)}` }],
          structuredContent: {
            ok: false,
            error: "RELOAD_FAILED",
            message: String(e?.message ?? e),
          },
          isError: true,
        };
      }
    },
  );
