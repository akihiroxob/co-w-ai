import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { workers } from "../../libs/workers";
import { execCommandCapture, resolveCommandFromPolicy } from "../../utils/shellUtil";
import { resolveBaseBranch, taskBranchName, worktreePathFor } from "../../utils/gitUtil";
import { CommandResult } from "../../types/CommandResult";
import { ensureDir } from "../../utils/fsUtil";
import { addActivityEvent, findTask, state } from "../../libs/state";
import { issueTaskId } from "../../utils/idUtil";
import { getIsoTime } from "../../utils/timeUtil";
import { loadRepoPolicy } from "../../utils/policyUtil";

type RunWorkerOptions = {
  agentId: string;
  taskId: string;
  prompt: string;
  baseBranch?: string;
  runAfterCommand?: string;
  timeoutMs: number;
  requireVerify: boolean;
  verifyCommandKey: string;
  autoSetTaskStatus: boolean;
  runId: string;
};

const emit = (
  ctx: { agentId: string; taskId: string; runId: string },
  action: string,
  detail: string,
  type: "workflow" | "agent" | "system" = "agent",
) => {
  addActivityEvent({
    id: issueTaskId("evt"),
    timestamp: getIsoTime(),
    type,
    action,
    detail,
    agentId: ctx.agentId,
    workflowId: ctx.taskId,
    runId: ctx.runId,
  });
};

export const executeWorkerTaskRun = async ({
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
}: RunWorkerOptions) => {
  const worker = workers.get(agentId);
  if (!worker) {
    return {
      ok: false,
      error: "WORKER_NOT_FOUND",
      agentId,
    };
  }

  const task = findTask(taskId);
  if (task && autoSetTaskStatus) {
    task.status = "doing";
    task.updatedAt = getIsoTime();
  }

  emit({ agentId, taskId, runId }, "run_start", "runWorkerTask started");

  const repo = worker.repoPath;
  const branch = taskBranchName(agentId, taskId);
  const wtPath = worktreePathFor(worker, agentId, taskId);

  const revParse = await execCommandCapture("git rev-parse --is-inside-work-tree", repo);
  if (!revParse.ok) {
    emit({ agentId, taskId, runId }, "run_fail", `not git repo: ${repo}`);
    return {
      ok: false,
      error: "NOT_GIT_REPO",
      agentId,
      taskId,
      runId,
      repo,
      details: revParse,
    };
  }

  const baseResolved = await resolveBaseBranch(repo, baseBranch);
  emit(
    { agentId, taskId, runId },
    "base_resolved",
    `base=${baseResolved.baseBranch}, tried=${baseResolved.tried.join(",")}`,
  );

  await ensureDir(worker.worktreeRoot);

  const wtList = await execCommandCapture("git worktree list --porcelain", repo);
  const already = wtList.ok && wtList.stdout.includes(`worktree ${wtPath}`);

  if (!already) {
    emit(
      { agentId, taskId, runId },
      "worktree_add_start",
      `branch=${branch} path=${wtPath} base=${baseResolved.baseBranch}`,
    );
    const add = await execCommandCapture(
      `git worktree add -b ${branch} "${wtPath}" ${baseResolved.baseBranch}`,
      repo,
    );
    if (!add.ok) {
      emit({ agentId, taskId, runId }, "worktree_add_fail", add.stderr || "worktree add failed");
      if (task && autoSetTaskStatus) {
        task.status = "blocked";
        task.updatedAt = getIsoTime();
      }
      return {
        ok: false,
        error: "WORKTREE_ADD_FAILED",
        add,
        baseResolved,
        agentId,
        taskId,
        runId,
        repo,
        worktreePath: wtPath,
        branch,
      };
    }
  }

  emit({ agentId, taskId, runId }, "codex_start", `timeoutMs=${timeoutMs}`);
  const codexCmd = `${worker.codexCmd} exec ${JSON.stringify(prompt)}`;
  const codexRes = await execCommandCapture(codexCmd, wtPath, { timeoutMs });
  emit(
    { agentId, taskId, runId },
    "codex_exit",
    `ok=${codexRes.ok} timedOut=${Boolean(codexRes.timedOut)} exitCode=${codexRes.exitCode}`,
  );

  let after: CommandResult | null = null;
  if (runAfterCommand) {
    emit({ agentId, taskId, runId }, "after_start", runAfterCommand);
    after = await execCommandCapture(runAfterCommand, wtPath, { timeoutMs });
    emit(
      { agentId, taskId, runId },
      "after_exit",
      `ok=${after.ok} timedOut=${Boolean(after.timedOut)} exitCode=${after.exitCode}`,
    );
  }

  const diffRes = await execCommandCapture("git diff", wtPath);
  const stagedDiffRes = await execCommandCapture("git diff --staged", wtPath);
  const statusRes = await execCommandCapture("git status --porcelain=v1", wtPath);
  const diffText = `${diffRes.ok ? diffRes.stdout : ""}${stagedDiffRes.ok ? stagedDiffRes.stdout : ""}`;

  emit({ agentId, taskId, runId }, "diff_collected", `diffLength=${diffText.length}`);

  const provenanceOk = diffText.length > 0;

  let verify: CommandResult | null = null;
  let verifyError: string | null = null;
  let verified = false;

  if (requireVerify) {
    try {
      const policy = await loadRepoPolicy(worker.repoPath);
      const resolved = resolveCommandFromPolicy(policy, verifyCommandKey);
      emit({ agentId, taskId, runId }, "verify_start", `${verifyCommandKey} -> ${resolved.command}`);
      verify = await execCommandCapture(resolved.command, wtPath, { timeoutMs });
      verified = verify.ok;
      emit(
        { agentId, taskId, runId },
        "verify_exit",
        `ok=${verify.ok} timedOut=${Boolean(verify.timedOut)} exitCode=${verify.exitCode}`,
      );
    } catch (e: any) {
      verifyError = String(e?.message ?? e);
      emit({ agentId, taskId, runId }, "verify_error", verifyError);
    }
  }

  state.taskRunMeta[taskId] = {
    taskId,
    agentId,
    worktreePath: wtPath,
    branch,
    baseBranch: baseResolved.baseBranch,
    diffLength: diffText.length,
    provenanceOk,
    verifyRequired: requireVerify,
    verifyCommandKey,
    verified,
    lastRunAt: getIsoTime(),
  };

  if (task && autoSetTaskStatus) {
    if (!codexRes.ok) {
      task.status = "blocked";
    } else if (!provenanceOk) {
      task.status = "blocked";
    } else if (requireVerify && !verified) {
      task.status = "blocked";
    } else {
      task.status = "wait_accept";
    }
    task.updatedAt = getIsoTime();
  }

  const ok = codexRes.ok && provenanceOk && (!requireVerify || verified);
  if (!ok) {
    emit(
      { agentId, taskId, runId },
      "run_incomplete",
      `ok=${codexRes.ok} provenance=${provenanceOk} verified=${verified}`,
    );
  } else {
    emit({ agentId, taskId, runId }, "run_done", "runWorkerTask completed");
  }

  return {
    ok,
    runId,
    agentId,
    taskId,
    repo,
    worktreePath: wtPath,
    branch,
    baseResolved,
    codex: codexRes,
    after,
    verify,
    verifyError,
    provenanceOk,
    taskStatus: task?.status,
    git: {
      status: statusRes.ok ? statusRes.stdout : "",
      diff: diffText,
    },
  };
};

export const registerRunWorkerTaskTool = (server: McpServer) =>
  server.registerTool(
    "runWorkerTask",
    {
      title: "runWorkerTask",
      description:
        "Create a git worktree for the task, run Codex in that worktree, verify (optional), then return diff.",
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
    }) => {
      const runId = issueTaskId("run");
      const payload = await executeWorkerTaskRun({
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

      if (!payload.ok) {
        return {
          content: [{ type: "text", text: "Worker run incomplete. See structuredContent" }],
          structuredContent: payload,
          isError: true,
        };
      }

      const diffLength = ((payload as any)?.git?.diff?.length ?? 0) as number;
      return {
        content: [{ type: "text", text: `Codex done. Diff length=${diffLength}` }],
        structuredContent: payload,
      };
    },
  );
