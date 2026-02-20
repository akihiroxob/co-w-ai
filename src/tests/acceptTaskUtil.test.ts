import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { state } from "../libs/state";
import { workers } from "../libs/workers";
import { acceptTaskWithPolicy } from "../utils/acceptTaskUtil";
import * as gitUtil from "../utils/gitUtil";
import * as shellUtil from "../utils/shellUtil";
import type { CommandResult } from "../types/CommandResult";

const commandResult = (overrides: Partial<CommandResult> = {}): CommandResult => ({
  ok: true,
  command: "mock",
  cwd: "/tmp/repo",
  exitCode: 0,
  signal: null,
  stdout: "",
  stderr: "",
  startedAt: "2026-01-01T00:00:00.000Z",
  finishedAt: "2026-01-01T00:00:00.000Z",
  durationMs: 1,
  ...overrides,
});

describe("acceptTaskWithPolicy", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    state.tasks = [];
    state.activityLog = [];
    state.workflows = [];
    state.agentRoles = {};
    state.lastCommand = null;
    workers.clear();
    vi.restoreAllMocks();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    vi.restoreAllMocks();
    workers.clear();
  });

  it("accepts wait_accept task and moves it to accepted with TL merge queued", async () => {
    const now = new Date().toISOString();
    state.agentRoles = {
      TL001: {
        agentId: "TL001",
        role: "tech lead",
      },
    };
    state.tasks.push(
      {
        id: "task_1",
        title: "impl",
        status: "wait_accept",
        assignee: "W2",
        createdAt: now,
        updatedAt: now,
      },
      {
        id: "review_1",
        title: "review",
        status: "doing",
        taskType: "pm_review",
        reviewTargetTaskId: "task_1",
        assignee: "W1",
        createdAt: now,
        updatedAt: now,
      },
    );

    const result = await acceptTaskWithPolicy("task_1");
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.integration.enabled).toBe(false);
    expect(state.tasks.find((t) => t.id === "task_1")?.status).toBe("accepted");
    expect(state.tasks.find((t) => t.id === "review_1")?.status).toBe("done");
    expect(
      state.tasks.some(
        (t) => t.taskType === "tl_merge" && t.reviewTargetTaskId === "task_1" && t.assignee === "TL001",
      ),
    ).toBe(true);
  });

  it("accepts in_review task and moves it to wait_accept with PM review queued", async () => {
    const now = new Date().toISOString();
    state.agentRoles = {
      PM001: {
        agentId: "PM001",
        role: "planning lead",
        isPm: true,
      },
    };
    state.tasks.push(
      {
        id: "task_in_review_1",
        title: "impl",
        status: "in_review",
        assignee: "W2",
        createdAt: now,
        updatedAt: now,
      },
      {
        id: "review_tl_1",
        title: "tl review",
        status: "doing",
        taskType: "tl_review",
        reviewTargetTaskId: "task_in_review_1",
        assignee: "TL001",
        createdAt: now,
        updatedAt: now,
      },
    );

    const result = await acceptTaskWithPolicy("task_in_review_1");
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.integration.enabled).toBe(false);
    expect(state.tasks.find((t) => t.id === "task_in_review_1")?.status).toBe("wait_accept");
    expect(state.tasks.find((t) => t.id === "review_tl_1")?.status).toBe("done");
    expect(
      state.tasks.some(
        (t) =>
          t.taskType === "pm_review" &&
          t.reviewTargetTaskId === "task_in_review_1" &&
          t.assignee === "PM001",
      ),
    ).toBe(true);
  });

  it("keeps task accepted when final integration fails", async () => {
    const now = new Date().toISOString();

    state.tasks.push({
      id: "task_2",
      title: "impl",
      status: "accepted",
      assignee: "W2",
      createdAt: now,
      updatedAt: now,
    });
    workers.set("W2", {
      agentId: "W2",
      repoPath: "/tmp/repo",
      worktreeRoot: "/tmp/repo/.worktrees",
      codexCmd: "codex",
    });

    vi.spyOn(gitUtil, "validateTaskWorktree").mockResolvedValue({
      ok: true,
      branch: "agent/W2/task_2",
      worktreePath: "/tmp/repo/.worktrees/W2__task_2",
    });

    vi.spyOn(shellUtil, "execCommandCapture")
      .mockResolvedValueOnce(commandResult({ cwd: "/tmp/repo/.worktrees/W2__task_2" }))
      .mockResolvedValueOnce(commandResult({ cwd: "/tmp/repo/.worktrees/W2__task_2", stdout: "abc123\n" }))
      .mockResolvedValueOnce(commandResult({ cwd: "/tmp/repo", stdout: "develop\n" }));

    const result = await acceptTaskWithPolicy("task_2");
    expect(result.ok).toBe(false);
    if (result.ok) return;

    expect(result.error).toBe("AUTO_INTEGRATE_FAILED");
    expect(state.tasks.find((t) => t.id === "task_2")?.status).toBe("accepted");
    expect(state.activityLog.some((e) => e.action === "task_auto_integrate_failed")).toBe(true);
  });

  it("integrates accepted task into main branch and marks it done", async () => {
    const now = new Date().toISOString();

    state.tasks.push({
      id: "task_3",
      title: "impl",
      status: "accepted",
      assignee: "W2",
      createdAt: now,
      updatedAt: now,
    });
    workers.set("W2", {
      agentId: "W2",
      repoPath: "/tmp/repo",
      worktreeRoot: "/tmp/repo/.worktrees",
      codexCmd: "codex",
    });

    vi.spyOn(gitUtil, "validateTaskWorktree").mockResolvedValue({
      ok: true,
      branch: "agent/W2/task_3",
      worktreePath: "/tmp/repo/.worktrees/W2__task_3",
    });

    vi.spyOn(shellUtil, "execCommandCapture")
      .mockResolvedValueOnce(
        commandResult({ cwd: "/tmp/repo/.worktrees/W2__task_3", stdout: " M src/index.ts\n" }),
      )
      .mockResolvedValueOnce(commandResult({ cwd: "/tmp/repo/.worktrees/W2__task_3" }))
      .mockResolvedValueOnce(commandResult({ cwd: "/tmp/repo/.worktrees/W2__task_3" }))
      .mockResolvedValueOnce(commandResult({ cwd: "/tmp/repo/.worktrees/W2__task_3", stdout: "abc123\n" }))
      .mockResolvedValueOnce(commandResult({ cwd: "/tmp/repo", stdout: "main\n" }))
      .mockResolvedValueOnce(commandResult({ cwd: "/tmp/repo" }))
      .mockResolvedValueOnce(commandResult({ ok: false, cwd: "/tmp/repo", exitCode: 1 }))
      .mockResolvedValueOnce(commandResult({ cwd: "/tmp/repo" }));

    const result = await acceptTaskWithPolicy("task_3");
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.integration.enabled).toBe(true);
    expect(result.integration.status).toBe("applied");
    expect(state.tasks.find((t) => t.id === "task_3")?.status).toBe("done");
    expect(state.activityLog.some((e) => e.action === "task_auto_integrated")).toBe(true);
  });
});
