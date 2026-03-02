import { beforeEach, describe, expect, it, vi } from "vitest";
import { state } from "../libs/state";
import { registerRejectTaskTool } from "../tools/rejectTask";

describe("rejectTask", () => {
  beforeEach(() => {
    state.tasks = [];
    state.activityLog = [];
    state.workflows = [];
    state.lastCommand = null;
  });

  it("stores reject metadata for rework", async () => {
    const handlers = new Map<string, Function>();
    const server = {
      registerTool: vi.fn((name: string, _config: unknown, handler: Function) => {
        handlers.set(name, handler);
      }),
    };

    registerRejectTaskTool(server as never);

    const now = new Date().toISOString();
    state.tasks.push({
      id: "task_reject_1",
      title: "review me",
      status: "in_review",
      assignee: "W2",
      createdAt: now,
      updatedAt: now,
    });

    const result = await handlers.get("rejectTask")?.({
      taskId: "task_reject_1",
      kind: "spec",
      reason: "Missing acceptance criteria coverage.",
      next: ["Clarify acceptance criteria.", "Add coverage for the missing path."],
    });

    expect(result.structuredContent.ok).toBe(true);
    expect(state.tasks[0]?.status).toBe("rejected");
    expect(state.tasks[0]?.reject).toEqual({
      kind: "spec",
      reason: "Missing acceptance criteria coverage.",
      next: ["Clarify acceptance criteria.", "Add coverage for the missing path."],
      rejectedAt: state.tasks[0]?.updatedAt,
    });
    expect(state.tasks[0]?.reworkReason).toBe("Missing acceptance criteria coverage.");
    expect(state.activityLog[state.activityLog.length - 1]?.detail).toContain("next:");
  });
});
