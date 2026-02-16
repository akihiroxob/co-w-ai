import { issueTaskId } from "./idUtil";
import { TaskStatus } from "../types/Task";
import { AgentRoleProfile, StoryQuestion, WorkflowTask } from "../types/StoryWorkflow";

export const buildClarifyingQuestions = (story: string): StoryQuestion[] => {
  const questions: StoryQuestion[] = [];
  const s = story.toLowerCase();

  if (!s.includes("受け入れ") && !s.includes("acceptance") && !s.includes("完了条件")) {
    questions.push({
      id: issueTaskId("q"),
      question: "受け入れ条件(成功判定)を具体的に教えてください。",
    });
  }

  if (!s.includes("対象外") && !s.includes("scope") && !s.includes("非機能")) {
    questions.push({
      id: issueTaskId("q"),
      question: "今回の対象外スコープ(やらないこと)があれば教えてください。",
    });
  }

  if (!s.includes("制約") && !s.includes("constraint") && !s.includes("互換")) {
    questions.push({
      id: issueTaskId("q"),
      question: "技術的制約(使えるライブラリ/禁止事項/互換要件)はありますか？",
    });
  }

  return questions.slice(0, 3);
};

const pickRole = (role: string, roles: AgentRoleProfile[]) => {
  const key = role.toLowerCase();
  return roles.filter((r) => r.role.toLowerCase().includes(key));
};

export const buildWorkflowTasks = (
  story: string,
  roles: AgentRoleProfile[],
): WorkflowTask[] => {
  const clauses = story
    .split(/\n|。|\./g)
    .map((x) => x.trim())
    .filter((x) => x.length > 0)
    .slice(0, 3);

  const planning = pickRole("planning", roles);
  const developers = roles.filter((r) => !/(qa|review|test|planning)/i.test(r.role));
  const qa = pickRole("qa", roles);
  const reviewers = pickRole("review", roles);

  const implementationAssignees = developers.length > 0 ? developers : roles;
  const fallbackAssignee = implementationAssignees[0]?.agentId;

  const tasks: WorkflowTask[] = clauses.map((clause, i) => ({
    taskId: issueTaskId("storytask"),
    title: `実装 ${i + 1}`,
    description: clause,
    assignee: implementationAssignees[i % Math.max(implementationAssignees.length, 1)]?.agentId,
    status: "todo" as TaskStatus,
  }));

  if (tasks.length === 0) {
    tasks.push({
      taskId: issueTaskId("storytask"),
      title: "実装",
      description: "開発ストーリーの要件を実装する",
      assignee: fallbackAssignee,
      status: "todo" as TaskStatus,
    });
  }

  tasks.push({
    taskId: issueTaskId("storytask"),
    title: "検査/受け入れ",
    description: "変更結果を検査し、受け入れ判定を行う",
    assignee:
      planning[0]?.agentId ?? qa[0]?.agentId ?? reviewers[0]?.agentId ?? fallbackAssignee,
    status: "todo" as TaskStatus,
  });

  return tasks;
};
