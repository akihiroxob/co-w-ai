import { describe, expect, it } from "vitest";
import { buildClarifyingQuestions, buildWorkflowTasks } from "../utils/workflowUtil";
import type { AgentRoleProfile } from "../types/StoryWorkflow";

describe("workflowUtil", () => {
  describe("buildClarifyingQuestions", () => {
    it("returns three clarification questions when story lacks key details", () => {
      const questions = buildClarifyingQuestions("新しいMCPツールを作る");

      expect(questions).toHaveLength(3);
      for (const q of questions) {
        expect(q.id).toMatch(/^q_[a-z0-9]+_[a-z0-9]{6}$/);
        expect(q.question.length).toBeGreaterThan(0);
      }
    });

    it("returns no questions when acceptance/scope/constraint cues exist", () => {
      const story =
        "受け入れ条件を定義する。対象外スコープを明記する。技術的制約と互換性要件も整理する。";
      const questions = buildClarifyingQuestions(story);

      expect(questions).toEqual([]);
    });
  });

  describe("buildWorkflowTasks", () => {
    it("creates up to three tasks and excludes qa/review/test/planning roles from implementation assignees", () => {
      const roles: AgentRoleProfile[] = [
        { agentId: "W1", role: "planning lead" },
        { agentId: "W2", role: "backend developer" },
        { agentId: "W3", role: "frontend developer" },
        { agentId: "W4", role: "qa verifier" },
      ];

      const tasks = buildWorkflowTasks("A. B. C. D.", roles);

      expect(tasks).toHaveLength(3);
      expect(tasks.map((t) => t.assignee)).toEqual(["W2", "W3", "W2"]);
      expect(tasks.every((t) => t.status === "todo")).toBe(true);
      expect(tasks.every((t) => /^storytask_[a-z0-9]+_[a-z0-9]{6}$/.test(t.taskId))).toBe(true);
    });

    it("creates a fallback task when no clause is parsed", () => {
      const roles: AgentRoleProfile[] = [{ agentId: "W2", role: "backend developer" }];

      const tasks = buildWorkflowTasks(" \n  \n", roles);

      expect(tasks).toHaveLength(1);
      expect(tasks[0]?.title).toBe("実装");
      expect(tasks[0]?.description).toBe("開発ストーリーの要件を実装する");
      expect(tasks[0]?.assignee).toBe("W2");
      expect(tasks[0]?.status).toBe("todo");
    });
  });
});
