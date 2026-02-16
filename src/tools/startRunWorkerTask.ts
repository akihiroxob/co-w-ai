import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { addActivityEvent, state } from "../libs/state";
import { issueTaskId } from "../utils/idUtil";
import { getIsoTime } from "../utils/timeUtil";
import { executeWorkerTaskRun } from "./admin/runWorkerTask";

export const registerStartRunWorkerTaskTool = (server: McpServer) =>
  server.registerTool(
    "startRunWorkerTask",
    {
      title: "startRunWorkerTask",
      description:
        "Start worker run asynchronously and return runId immediately. Track progress via getRunStatus/listRuns/activityLog.",
      inputSchema: {
        agentId: z.string().min(1),
        taskId: z.string().min(1),
        prompt: z.string().min(1),
        baseBranch: z.string().optional(),
        runAfterCommand: z.string().optional(),
        timeoutMs: z.number().int().positive().max(3_600_000).default(300_000),
        requireVerify: z.boolean().default(true),
        verifyCommandKey: z.string().default("test"),
        autoSetTaskStatus: z.boolean().default(true),
        heartbeatMs: z.number().int().min(3_000).max(120_000).default(10_000),
      },
    },
    async ({
      agentId,
      taskId,
      prompt,
      baseBranch,
      runAfterCommand,
      timeoutMs,
      requireVerify,
      verifyCommandKey,
      autoSetTaskStatus,
      heartbeatMs,
    }) => {
      const runId = issueTaskId("run");
      const now = getIsoTime();

      state.runs[runId] = {
        runId,
        taskId,
        agentId,
        status: "queued",
        createdAt: now,
        updatedAt: now,
      };

      addActivityEvent({
        id: issueTaskId("evt"),
        timestamp: now,
        type: "system",
        action: "async_run_queued",
        detail: `queued run ${runId}`,
        agentId,
        workflowId: taskId,
        runId,
      });

      setTimeout(() => {
        void (async () => {
          const startedAt = getIsoTime();
          state.runs[runId].status = "running";
          state.runs[runId].startedAt = startedAt;
          state.runs[runId].updatedAt = startedAt;

          addActivityEvent({
            id: issueTaskId("evt"),
            timestamp: startedAt,
            type: "system",
            action: "async_run_started",
            detail: `run ${runId} started`,
            agentId,
            workflowId: taskId,
            runId,
          });

          const hb = setInterval(() => {
            const running = state.runs[runId];
            if (!running || running.status !== "running") return;
            addActivityEvent({
              id: issueTaskId("evt"),
              timestamp: getIsoTime(),
              type: "system",
              action: "heartbeat",
              detail: "run still running",
              agentId,
              workflowId: taskId,
              runId,
            });
          }, heartbeatMs);

          try {
            const result = await executeWorkerTaskRun({
              agentId,
              taskId,
              prompt,
              baseBranch,
              runAfterCommand,
              timeoutMs,
              requireVerify,
              verifyCommandKey,
              autoSetTaskStatus,
              runId,
            });

            const finishedAt = getIsoTime();
            state.runs[runId] = {
              ...state.runs[runId],
              status: result.ok ? "succeeded" : "failed",
              updatedAt: finishedAt,
              finishedAt,
              result,
              summary: result.ok
                ? `success diffLength=${result.git?.diff?.length ?? 0}`
                : `failed error=${(result as any).error ?? "RUN_INCOMPLETE"}`,
              baseBranch: (result as any).baseResolved?.baseBranch,
              branch: (result as any).branch,
              worktreePath: (result as any).worktreePath,
            };

            addActivityEvent({
              id: issueTaskId("evt"),
              timestamp: finishedAt,
              type: "system",
              action: "async_run_finished",
              detail: `run ${runId} -> ${state.runs[runId].status}`,
              agentId,
              workflowId: taskId,
              runId,
            });
          } catch (e: any) {
            const finishedAt = getIsoTime();
            state.runs[runId] = {
              ...state.runs[runId],
              status: "failed",
              updatedAt: finishedAt,
              finishedAt,
              error: String(e?.message ?? e),
              summary: "failed exception",
            };

            addActivityEvent({
              id: issueTaskId("evt"),
              timestamp: finishedAt,
              type: "system",
              action: "async_run_error",
              detail: String(e?.message ?? e),
              agentId,
              workflowId: taskId,
              runId,
            });
          } finally {
            clearInterval(hb);
          }
        })();
      }, 0);

      return {
        content: [{ type: "text", text: `run started: ${runId}` }],
        structuredContent: {
          ok: true,
          runId,
          status: state.runs[runId].status,
          taskId,
          agentId,
          hint: "Use getRunStatus/listRuns/activityLog to monitor",
        },
      };
    },
  );
