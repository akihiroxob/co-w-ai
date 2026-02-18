import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { addActivityEvent, findWorkflow, state } from "../libs/state";
import { issueTaskId } from "../utils/idUtil";
import { getIsoTime } from "../utils/timeUtil";
import { buildClarifyingQuestions, buildWorkflowTasks } from "../utils/workflowUtil";
import { claimTaskForAgent } from "../utils/taskClaimUtil";
import { StoryWorkflow, WorkflowTask } from "../types/StoryWorkflow";
import { Task } from "../types/Task";

const parseBool = (v: string | undefined) => {
  if (!v) return false;
  return ["1", "true", "yes", "on"].includes(v.toLowerCase());
};

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
    workflowId: wfId,
    title: `[${wfId}] ${wt.title}`,
    description: wt.description,
    status: wt.status,
    taskType: "implementation",
    assignee: wt.assignee,
    createdAt: now,
    updatedAt: now,
  };
};

const workflowTasksFromState = (workflowId: string) => {
  return state.tasks.filter((t) => t.workflowId === workflowId);
};

export const registerRunStoryWorkflowTool = (server: McpServer) =>
  server.registerTool(
    "runStoryWorkflow",
    {
      title: "runStoryWorkflow",
      description:
        "PM/planning gateway: clarify requirements and decompose a story into backlog tasks.",
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
        autoExecute: z.boolean().optional(),
        autoVerify: z.boolean().optional(),
        baseBranch: z.string().optional(),
        planningAutoAccept: z.boolean().optional(),
      },
    },
    async ({ workflowId, story, answers, autoExecute, autoVerify, baseBranch, planningAutoAccept }) => {
      const wantsExecutionOptions = Boolean(
        autoExecute || planningAutoAccept || autoVerify || baseBranch,
      );
      const executionEnabled = parseBool(process.env.COWAI_ENABLE_WORKFLOW_EXECUTION);
      if (wantsExecutionOptions && !executionEnabled) {
        return {
          content: [
            {
              type: "text",
              text: "Execution options are disabled. Set COWAI_ENABLE_WORKFLOW_EXECUTION=true to enable them.",
            },
          ],
          structuredContent: {
            ok: false,
            error: "WORKFLOW_EXECUTION_DISABLED",
            hint:
              "runStoryWorkflow is planning-only unless COWAI_ENABLE_WORKFLOW_EXECUTION=true. Use claimTask -> submitTask -> acceptTask/rejectTask.",
          },
          isError: true,
        };
      }

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

      const existingWorkflowTasks = workflowTasksFromState(workflow.id);
      const existingImplementationTasks = existingWorkflowTasks.filter(
        (t) => t.taskType !== "pm_review",
      );
      if (existingImplementationTasks.length === 0) {
        const roles = Object.values(state.agentRoles);

        if (roles.length === 0) {
          return {
            content: [{ type: "text", text: "No agent roles configured" }],
            structuredContent: {
              ok: false,
              error: "AGENT_ROLES_REQUIRED",
              hint: "Define role profile fields directly in settings/workers.yaml",
              workflowId: workflow.id,
            },
            isError: true,
          };
        }

        const plannedTasks = buildWorkflowTasks(workflow.story, roles);
        workflow.updatedAt = getIsoTime();

        for (const task of plannedTasks) {
          state.tasks.push(toStateTask(workflow.id, task));
        }

        addActivityEvent({
          id: issueTaskId("evt"),
          timestamp: getIsoTime(),
          type: "workflow",
          action: "tasks_decomposed",
          detail: `Created ${plannedTasks.length} task(s)`,
          workflowId: workflow.id,
        });
      }

      const currentWorkflowTasks = workflowTasksFromState(workflow.id);
      if (autoExecute) {
        let claimedCount = 0;
        for (const task of currentWorkflowTasks) {
          if (task.taskType === "pm_review") continue;
          if (!task.assignee) continue;
          const result = await claimTaskForAgent(task.id, task.assignee);
          if (result.ok) claimedCount += 1;
        }
        if (claimedCount > 0) {
          addActivityEvent({
            id: issueTaskId("evt"),
            timestamp: getIsoTime(),
            type: "workflow",
            action: "workflow_auto_execute_claimed",
            detail: `Auto-claimed ${claimedCount} task(s)`,
            workflowId: workflow.id,
          });
        }
      }

      workflow.status = "ready";
      workflow.report = `workflow=${workflow.id}; status=ready; tasks=${currentWorkflowTasks.length}`;
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
          tasks: currentWorkflowTasks,
        },
      };
    },
  );
