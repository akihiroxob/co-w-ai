import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { state } from "../libs/state";
import { workers } from "../libs/workers";
import { startWorkerExecutionLoop } from "../utils/workerExecutionLoop";
import * as shellUtil from "../utils/shellUtil";
import * as gitUtil from "../utils/gitUtil";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe("workerExecutionLoop env wiring", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    state.tasks = [];
    state.activityLog = [];
    state.workflows = [];
    state.lastCommand = null;
    workers.clear();
    vi.restoreAllMocks();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    vi.restoreAllMocks();
    workers.clear();
    state.tasks = [];
    state.activityLog = [];
    state.workflows = [];
    state.lastCommand = null;
  });

  it("passes shared cowai paths to subprocess environment", async () => {
    process.env.COWAI_AUTO_EXECUTE = "true";
    process.env.COWAI_AUTO_EXECUTE_INTERVAL_MS = "1000";
    process.env.COWAI_AUTO_EXECUTE_TIMEOUT_MS = "1000";

    const now = new Date().toISOString();
    const taskId = "task_env_wiring_1";
    state.tasks.push({
      id: taskId,
      title: "env wiring",
      status: "doing",
      assignee: "W2",
      createdAt: now,
      updatedAt: now,
    });

    workers.set("W2", {
      agentId: "W2",
      repoPath: "/tmp/repo-root",
      worktreeRoot: "/tmp/repo-root/.worktrees",
      codexCmd: "codex",
    });

    vi.spyOn(gitUtil, "validateTaskWorktree").mockResolvedValue({
      ok: true,
      branch: "agent/W2/task_env_wiring_1",
      worktreePath: "/tmp/repo-root/.worktrees/W2__task_env_wiring_1",
    });

    const execSpy = vi.spyOn(shellUtil, "execCommandCapture").mockResolvedValue({
      ok: true,
      command: "mock",
      cwd: "/tmp/repo-root/.worktrees/W2__task_env_wiring_1",
      exitCode: 0,
      signal: null,
      stdout: "",
      stderr: "",
      startedAt: now,
      finishedAt: now,
      durationMs: 1,
      timedOut: false,
    });

    const loop = startWorkerExecutionLoop();
    expect(loop.enabled).toBe(true);
    if (!loop.enabled) return;

    await sleep(30);
    clearInterval(loop.timer);

    expect(execSpy).toHaveBeenCalled();
    const [, , options] = execSpy.mock.calls[0];
    expect(options?.env?.COWAI_WORKERS_FILE).toBe("/tmp/repo-root/settings/workers.yaml");
    expect(options?.env?.COWAI_ACTIVITY_LOG_FILE).toBe("/tmp/repo-root/logs/activity.ndjson");
    expect(options?.env?.COWAI_STATE_FILE).toBe("/tmp/repo-root/logs/state.json");
  });
});
