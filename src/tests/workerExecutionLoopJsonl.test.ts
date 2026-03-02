import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { state } from "../libs/state";
import { workers } from "../libs/workers";
import { startWorkerExecutionLoop } from "../utils/workerExecutionLoop";
import * as shellUtil from "../utils/shellUtil";
import * as gitUtil from "../utils/gitUtil";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe("workerExecutionLoop jsonl", () => {
  const originalEnv = { ...process.env };
  let repoPath = "";

  beforeEach(async () => {
    repoPath = await mkdtemp(path.join(os.tmpdir(), "cowai-jsonl-"));
    state.tasks = [];
    state.activityLog = [];
    state.workflows = [];
    state.lastCommand = null;
    workers.clear();
    vi.restoreAllMocks();
    process.env = { ...originalEnv };
  });

  afterEach(async () => {
    process.env = { ...originalEnv };
    vi.restoreAllMocks();
    workers.clear();
    state.tasks = [];
    state.activityLog = [];
    state.workflows = [];
    state.lastCommand = null;
    if (repoPath) {
      await rm(repoPath, { recursive: true, force: true });
    }
  });

  it("streams codex jsonl into run logs and activity log", async () => {
    process.env.COWAI_AUTO_EXECUTE = "true";
    process.env.COWAI_AUTO_EXECUTE_INTERVAL_MS = "1000";
    process.env.COWAI_AUTO_EXECUTE_TIMEOUT_MS = "1000";
    process.env.COWAI_ENABLE_CODEX_JSONL = "true";

    const now = new Date().toISOString();
    const taskId = "task_jsonl_1";
    state.tasks.push({
      id: taskId,
      title: "jsonl task",
      status: "doing",
      assignee: "W2",
      reject: {
        kind: "quality",
        reason: "Tests were missing.",
        next: ["Add the missing test.", "Re-run local verification."],
        rejectedAt: now,
        rejectedBy: "TL1",
      },
      createdAt: now,
      updatedAt: now,
    });

    workers.set("W2", {
      agentId: "W2",
      repoPath,
      worktreeRoot: path.join(repoPath, ".worktrees"),
      codexCmd: "codex",
    });

    vi.spyOn(gitUtil, "validateTaskWorktree").mockResolvedValue({
      ok: true,
      branch: "agent/W2/task_jsonl_1",
      worktreePath: path.join(repoPath, ".worktrees", "W2__task_jsonl_1"),
    });

    const streamSpy = vi.spyOn(shellUtil, "execCommandStreamingJsonl").mockImplementation(
      async (command, cwd, options) => {
        await options?.onStdoutLine?.('{"type":"tool","tool_name":"web_search","message":"search docs"}');
        await options?.onStdoutLine?.('{"type":"message","message":"implemented changes"}');
        return {
          ok: true,
          command,
          cwd,
          exitCode: 0,
          signal: null,
          stdout:
            '{"type":"tool","tool_name":"web_search","message":"search docs"}\n{"type":"message","message":"implemented changes"}\n',
          stderr: "",
          startedAt: now,
          finishedAt: now,
          durationMs: 1,
          timedOut: false,
        };
      },
    );

    const loop = startWorkerExecutionLoop();
    expect(loop.enabled).toBe(true);
    if (!loop.enabled) return;

    await sleep(30);
    clearInterval(loop.timer);

    expect(streamSpy).toHaveBeenCalledTimes(1);
    const [command] = streamSpy.mock.calls[0];
    expect(command).toContain("exec --json");
    expect(command).toContain("Latest Rework Context:");
    expect(command).toContain("Add the missing test.");

    const runEvent = state.activityLog.find((event) => event.action === "worker_execution_run_created");
    expect(runEvent?.runId).toBeTruthy();
    const toolEvent = state.activityLog.find((event) => event.kind === "tool");
    expect(toolEvent?.title).toBe("Tool: web_search");
    expect(toolEvent?.taskId).toBe(taskId);
    expect(toolEvent?.runId).toBe(runEvent?.runId);

    const eventsPath = path.join(repoPath, "logs", "runs", taskId, String(runEvent?.runId), "events.jsonl");
    const persisted = await readFile(eventsPath, "utf8");
    expect(persisted).toContain('"tool_name":"web_search"');
    expect(persisted).toContain('"message":"implemented changes"');
    expect(state.tasks[0]?.status).toBe("in_review");
  });
});
