import { describe, expect, it } from "vitest";
import { state } from "../libs/state";
import { handleReportProgress } from "../tools/reportProgress";

describe("reportProgress", () => {
  it("records worker_progress_reported for doing task with matching assignee", async () => {
    const now = new Date().toISOString();
    const taskId = "task_test_progress_1";
    state.tasks.push({
      id: taskId,
      title: "test task",
      status: "doing",
      assignee: "W2",
      createdAt: now,
      updatedAt: now,
    });

    const initialLogCount = state.activityLog.length;
    const result = await handleReportProgress({
      taskId,
      agentId: "W2",
      message: "working",
    });

    expect("isError" in result).toBe(false);
    expect(result.structuredContent.ok).toBe(true);

    const latestEvent = state.activityLog[state.activityLog.length - 1];
    expect(state.activityLog.length).toBe(initialLogCount + 1);
    expect(latestEvent.action).toBe("worker_progress_reported");
    expect(latestEvent.agentId).toBe("W2");
    expect(latestEvent.detail).toContain(taskId);

    state.tasks = state.tasks.filter((t) => t.id !== taskId);
  });
});
