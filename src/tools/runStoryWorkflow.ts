import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import path from "node:path";
import { workers } from "../libs/workers";
import { addActivityEvent, findWorkflow, state } from "../libs/state";
import { issueTaskId } from "../utils/idUtil";
import { getIsoTime } from "../utils/timeUtil";
import { buildClarifyingQuestions, buildWorkflowTasks } from "../utils/workflowUtil";
import { StoryWorkflow, WorkflowTask } from "../types/StoryWorkflow";
import { Task } from "../types/Task";
import { ensureDir } from "../utils/fsUtil";
import { safeBranchName, worktreePathFor } from "../utils/gitUtil";
import { execCommandCapture, resolveCommandFromPolicy } from "../utils/shellUtil";
import { loadRepoPolicy } from "../utils/policyUtil";
import { loadAgentRolesFromMarkdown } from "../utils/agentRoleUtil";

const applyAnswers = (
  workflow: StoryWorkflow,
  answers: { questionId: string; answer: string }[],
): StoryWorkflow => {
  for (const q of workflow.questions) {
    const matched = answers.find((a) => a.questionId === q.id);
    if (matched && matched.answer.trim().length > 0) {
      q.answer = matched.answer.trim();
    }
  }
  return workflow;
};

const unresolvedQuestions = (workflow: StoryWorkflow) => {
  return workflow.questions.filter((q) => !q.answer || q.answer.trim().length === 0);
};

const toStateTask = (wfId: string, wt: WorkflowTask): Task => {
  const now = getIsoTime();
  return {
    id: wt.taskId,
    title: `[${wfId}] ${wt.title}`,
    description: wt.description,
    status: wt.status,
    assignee: wt.assignee,
    createdAt: now,
    updatedAt: now,
  };
};

const runSubTask = async (
  workflowId: string,
  task: WorkflowTask,
  story: string,
  baseBranch: string,
  autoVerify: boolean,
) => {
  const now = getIsoTime();
  task.status = "doing";

  addActivityEvent({
    id: issueTaskId("evt"),
    timestamp: now,
    type: "agent",
    action: "subtask_start",
    detail: `${task.title}: ${task.description}`,
    workflowId,
    agentId: task.assignee,
  });

  if (!task.assignee) {
    task.status = "blocked";
    task.notes = "Assignee is missing";
    return;
  }

  const worker = workers.get(task.assignee);
  if (!worker) {
    task.status = "blocked";
    task.notes = `Worker not found: ${task.assignee}`;
    return;
  }

  const branch = `agent/${task.assignee}/${safeBranchName(task.taskId)}`;
  const wtPath = worktreePathFor(worker, task.assignee, task.taskId);

  const revParse = await execCommandCapture("git rev-parse --is-inside-work-tree", worker.repoPath);
  if (!revParse.ok) {
    task.status = "blocked";
    task.commandResult = revParse;
    task.notes = "Target repository is not a git repository";
    return;
  }

  await ensureDir(worker.worktreeRoot);

  const wtList = await execCommandCapture("git worktree list --porcelain", worker.repoPath);
  const already = wtList.ok && wtList.stdout.includes(`worktree ${wtPath}`);

  if (!already) {
    const add = await execCommandCapture(
      `git worktree add -b ${branch} "${wtPath}" ${baseBranch}`,
      worker.repoPath,
    );
    if (!add.ok) {
      task.status = "blocked";
      task.commandResult = add;
      task.notes = "Failed to create git worktree";
      return;
    }
  }

  const role = state.agentRoles[task.assignee]?.role ?? "developer";
  const focus = state.agentRoles[task.assignee]?.focus ?? "";
  const prompt = [
    `あなたは役割=${role} です。`,
    focus ? `注力点: ${focus}` : "",
    `ストーリー: ${story}`,
    `担当タスク: ${task.title}`,
    `詳細: ${task.description}`,
    "変更後に必要なら最小限のテスト/検証を実施してください。",
  ]
    .filter(Boolean)
    .join("\n");

  const codexCmd = `${worker.codexCmd} exec ${JSON.stringify(prompt)}`;
  const codexRes = await execCommandCapture(codexCmd, wtPath);
  task.commandResult = codexRes;

  const diffRes = await execCommandCapture("git diff --stat", wtPath);
  task.notes = diffRes.ok ? diffRes.stdout.trim() : "No diff summary available";

  if (!codexRes.ok) {
    task.status = "blocked";
    addActivityEvent({
      id: issueTaskId("evt"),
      timestamp: getIsoTime(),
      type: "agent",
      action: "subtask_failed",
      detail: `${task.title} failed`,
      workflowId,
      agentId: task.assignee,
    });
    return;
  }

  if (autoVerify) {
    try {
      const policy = await loadRepoPolicy(worker.repoPath);
      const verifyKey = state.agentRoles[task.assignee]?.verifyCommandKey ?? "test";
      const resolved = resolveCommandFromPolicy(policy, verifyKey);
      task.verifyResult = await execCommandCapture(resolved.command, wtPath);
      if (!task.verifyResult.ok) {
        task.status = "review";
        task.notes = `${task.notes ?? ""}\nVerification failed: ${verifyKey}`.trim();
      } else {
        task.status = "done";
      }
    } catch {
      task.status = "done";
      task.notes = `${task.notes ?? ""}\nVerification skipped (policy/command unavailable)`.trim();
    }
  } else {
    task.status = "done";
  }

  addActivityEvent({
    id: issueTaskId("evt"),
    timestamp: getIsoTime(),
    type: "agent",
    action: "subtask_complete",
    detail: `${task.title} -> ${task.status}`,
    workflowId,
    agentId: task.assignee,
  });
};

export const registerRunStoryWorkflowTool = (server: McpServer) =>
  server.registerTool(
    "runStoryWorkflow",
    {
      title: "runStoryWorkflow",
      description:
        "Run story-driven collaborative workflow: clarify questions, decompose tasks, execute by role, verify, and report.",
      inputSchema: {
        workflowId: z.string().optional(),
        story: z.string().optional(),
        answers: z
          .array(
            z.object({
              questionId: z.string().min(1),
              answer: z.string().min(1),
            }),
          )
          .optional(),
        autoExecute: z.boolean().default(true),
        autoVerify: z.boolean().default(true),
        baseBranch: z.string().default("main"),
      },
    },
    async ({ workflowId, story, answers, autoExecute, autoVerify, baseBranch }) => {
      let workflow = workflowId ? findWorkflow(workflowId) : undefined;

      if (!workflow) {
        if (!story || story.trim().length === 0) {
          return {
            content: [{ type: "text", text: "story is required for new workflow" }],
            structuredContent: { ok: false, error: "STORY_REQUIRED" },
            isError: true,
          };
        }

        workflow = {
          id: issueTaskId("wf"),
          story,
          status: "awaiting_user",
          createdAt: getIsoTime(),
          updatedAt: getIsoTime(),
          questions: buildClarifyingQuestions(story),
          tasks: [],
        };
        state.workflows.push(workflow);

        addActivityEvent({
          id: issueTaskId("evt"),
          timestamp: getIsoTime(),
          type: "workflow",
          action: "workflow_created",
          detail: "Created from story request",
          workflowId: workflow.id,
        });
      }

      if (answers && answers.length > 0) {
        applyAnswers(workflow, answers);
        workflow.updatedAt = getIsoTime();

        addActivityEvent({
          id: issueTaskId("evt"),
          timestamp: getIsoTime(),
          type: "workflow",
          action: "answers_applied",
          detail: `Applied ${answers.length} answer(s)`,
          workflowId: workflow.id,
        });
      }

      const unresolved = unresolvedQuestions(workflow);
      if (unresolved.length > 0) {
        workflow.status = "awaiting_user";
        workflow.updatedAt = getIsoTime();
        return {
          content: [{ type: "text", text: `clarification required (${unresolved.length})` }],
          structuredContent: {
            ok: true,
            workflowId: workflow.id,
            status: workflow.status,
            questions: unresolved,
          },
        };
      }

      if (workflow.tasks.length === 0) {
        let roles = Object.values(state.agentRoles);
        if (roles.length === 0) {
          const fallbackRepoPath = workers.values().next().value?.repoPath;
          if (fallbackRepoPath) {
            try {
              const loaded = await loadAgentRolesFromMarkdown(fallbackRepoPath);
              for (const role of loaded.roles) {
                state.agentRoles[role.agentId] = role;
              }
              roles = Object.values(state.agentRoles);
              addActivityEvent({
                id: issueTaskId("evt"),
                timestamp: getIsoTime(),
                type: "system",
                action: "load_roles_md_auto",
                detail: `loaded ${loaded.roles.length} role(s) from ${loaded.path}`,
                workflowId: workflow.id,
              });
            } catch {
              // explicit load tool can provide detailed error
            }
          }
        }

        if (roles.length === 0) {
          return {
            content: [{ type: "text", text: "No agent roles configured" }],
            structuredContent: {
              ok: false,
              error: "AGENT_ROLES_REQUIRED",
              hint: "Prepare <repo>/.agent/roles.md and call loadAgentRoles",
              workflowId: workflow.id,
            },
            isError: true,
          };
        }

        workflow.tasks = buildWorkflowTasks(workflow.story, roles);
        workflow.updatedAt = getIsoTime();

        for (const task of workflow.tasks) {
          state.tasks.push(toStateTask(workflow.id, task));
        }

        addActivityEvent({
          id: issueTaskId("evt"),
          timestamp: getIsoTime(),
          type: "workflow",
          action: "tasks_decomposed",
          detail: `Created ${workflow.tasks.length} task(s)`,
          workflowId: workflow.id,
        });
      }

      if (!autoExecute) {
        workflow.status = "ready";
        workflow.updatedAt = getIsoTime();
        return {
          content: [{ type: "text", text: "workflow ready" }],
          structuredContent: {
            ok: true,
            workflowId: workflow.id,
            status: workflow.status,
            tasks: workflow.tasks,
          },
        };
      }

      workflow.status = "executing";
      workflow.updatedAt = getIsoTime();

      for (const task of workflow.tasks) {
        if (task.status === "todo" || task.status === "doing") {
          await runSubTask(workflow.id, task, workflow.story, baseBranch, autoVerify);
        }

        const taskInState = state.tasks.find((t) => t.id === task.taskId);
        if (taskInState) {
          taskInState.status = task.status;
          taskInState.updatedAt = getIsoTime();
        }
      }

      const blocked = workflow.tasks.filter((t) => t.status === "blocked").length;
      const review = workflow.tasks.filter((t) => t.status === "review").length;
      const done = workflow.tasks.filter((t) => t.status === "done").length;

      if (blocked > 0) {
        workflow.status = "blocked";
      } else if (done === workflow.tasks.length && review === 0) {
        workflow.status = "reported";
      } else {
        workflow.status = "verified";
      }

      workflow.report = [
        `workflow=${workflow.id}`,
        `status=${workflow.status}`,
        `done=${done}/${workflow.tasks.length}`,
        `review=${review}`,
        `blocked=${blocked}`,
      ].join("; ");
      workflow.updatedAt = getIsoTime();

      addActivityEvent({
        id: issueTaskId("evt"),
        timestamp: getIsoTime(),
        type: "workflow",
        action: "workflow_reported",
        detail: workflow.report,
        workflowId: workflow.id,
      });

      return {
        content: [{ type: "text", text: workflow.report }],
        structuredContent: {
          ok: true,
          workflowId: workflow.id,
          status: workflow.status,
          report: workflow.report,
          tasks: workflow.tasks,
          activityTail: state.activityLog.slice(Math.max(0, state.activityLog.length - 30)),
        },
      };
    },
  );
