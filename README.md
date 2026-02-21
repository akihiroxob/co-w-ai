# co-w-ai

Story-driven multi-agent orchestrator for collaborative development via MCP tools.

## Architecture
- Human <-> Codex (MCP client) <-> Planning flow (`runStoryWorkflow`) -> Worker agents
- Worker + role/personality settings are unified in `settings/workers.yaml`.

## Build & Run
```bash
pnpm install
pnpm build
pnpm start
```

## Single Config Policy
Use only `workers.yaml` for MCP-side worker/role configuration.

Worker config resolution order:
1. `<current workdir>/settings/workers.yaml`
2. `<co-w-ai repo>/settings/workers.yaml` (fallback)

Each worker entry can include both runtime and role profile fields:
- runtime: `agentId`, `repoPath`, `worktreeDirName`, `codexCmd`
- role profile: `role`, `focus`, `personality`, `verifyCommandKey`

## Policy Fallback
Policy resolution order for verification commands:
1. `<target repo>/.agent/policy.yaml`
2. `<current workdir>/settings/default.policy.yaml`
3. `<co-w-ai repo>/settings/default.policy.yaml` (fallback)

## Worker Boot
- Default config file: `settings/workers.yaml`
- Optional override: `COWAI_WORKERS_FILE`
- Workers and role profiles are preloaded at startup.
- `spawnWorker` is for temporary/manual registration when needed.
- Optional auto-claim loop:
  - enable: `COWAI_AUTO_CLAIM=true`
  - interval ms: `COWAI_AUTO_CLAIM_INTERVAL_MS` (default `5000`)
  - per-agent max doing: `COWAI_AUTO_CLAIM_MAX_DOING_PER_AGENT` (default `1`)
  - requires worktree creation permission (same requirement as manual `claimTask`)
- Optional worker execution loop:
  - enable: `COWAI_AUTO_EXECUTE=true`
  - interval ms: `COWAI_AUTO_EXECUTE_INTERVAL_MS` (default `5000`)
  - command timeout ms: `COWAI_AUTO_EXECUTE_TIMEOUT_MS` (default `1200000`)
  - heartbeat interval ms: `COWAI_AUTO_EXECUTE_HEARTBEAT_INTERVAL_MS` (default `10000`)
  - optional verify after worker command: `COWAI_AUTO_VERIFY_ON_EXECUTE=true`
  - optional auto accept after submit: `COWAI_AUTO_ACCEPT_ON_EXECUTE=true`
  - optional auto integration to target branch when accepted: `COWAI_AUTO_INTEGRATE_ON_ACCEPT=true`
  - target branch for auto integration: `COWAI_INTEGRATION_TARGET_BRANCH` (default: `main`)
  - requires worker command to support: `<codexCmd> exec "<prompt>" --skip-git-repo-check`

## Task Status
- `todo` -> `doing` -> `in_review` -> `wait_accept` -> `accepted` -> `done`
- `rejectTask` moves a task to `rejected` with reason and rework metadata.
- `rejected` tasks are rework-priority and can be reclaimed (`rejected` -> `doing`).
- reviews are status-driven on the same implementation task (no separate review tasks).
- PM assignee resolution uses `settings/workers.yaml` role profile:
  - preferred: `isPm: true`
  - fallback: role name matches `planning|pm|product manager`
- TechLead assignee resolution uses role name match: `tech lead|techlead|architect|tl`.
- development handoff:
  - `claimTask` (`todo` -> `doing`)
  - `submitTask` (`doing` -> `in_review`)
- worktree enforcement is built into the same flow:
  - `claimTask` auto-prepares task worktree/branch for the assignee
  - `submitTask` is rejected if the expected task worktree is missing or inconsistent
- once submitted (`in_review`), worker can move to other tasks without waiting for reviewer acceptance.
- `in_review` is reviewed by TechLead (quality):
  - accept: `acceptTask` (`in_review` -> `wait_accept`)
  - reject: `rejectTask` (`in_review` -> `rejected`)
- `wait_accept` is reviewed by PM/planning (acceptance criteria):
  - accept: `acceptTask` (`wait_accept` -> `accepted`)
  - reject: `rejectTask` (`wait_accept` -> `rejected`)
- `accepted` is finalized by TechLead merge:
  - accept: `acceptTask` (`accepted` -> `done`)
  - reject: `rejectTask` (`accepted` -> `rejected`)
- review worker flow:
  - reviewer must call `acceptTask` / `rejectTask` on the same task.
  - if review ends without decision, task is auto-rejected with reason.

## PM Gateway
- Route all requests through `runStoryWorkflow` (PM/planning gateway).
- By default, execution flags (`autoExecute`, `autoVerify`, `planningAutoAccept`, `baseBranch`) are disabled.
- To enable execution flags, set `COWAI_ENABLE_WORKFLOW_EXECUTION=true` in the MCP server environment.
- Use `activityLog` for execution monitoring.
- Use `reportProgress` for structured worker progress updates during long-running tasks.

## Environment Variables
| Name | Purpose | Default | Notes |
| --- | --- | --- | --- |
| `COWAI_WORKERS_FILE` | Override workers config path | `<cwd>/settings/workers.yaml`, then repo fallback | Relative path is resolved from current working directory. |
| `COWAI_AUTO_CLAIM` | Enable automatic `todo/rejected` -> `doing` claiming loop | `false` | Truthy values: `1`, `true`, `yes`, `on`. |
| `COWAI_AUTO_CLAIM_INTERVAL_MS` | Auto-claim loop interval (ms) | `5000` | Invalid values fall back to default. |
| `COWAI_AUTO_CLAIM_MAX_DOING_PER_AGENT` | Max concurrent `doing` tasks per agent in auto-claim loop | `1` | Invalid values fall back to default. |
| `COWAI_AUTO_EXECUTE` | Enable automatic worker execution for `doing` tasks | `false` | Uses each worker's `codexCmd`. |
| `COWAI_AUTO_EXECUTE_INTERVAL_MS` | Worker execution loop interval (ms) | `5000` | Invalid values fall back to default. |
| `COWAI_AUTO_EXECUTE_TIMEOUT_MS` | Worker command timeout (ms) | `1200000` | Command is terminated on timeout. |
| `COWAI_AUTO_EXECUTE_HEARTBEAT_INTERVAL_MS` | Worker execution heartbeat interval (ms) | `10000` | Adds `worker_execution_heartbeat` events while running. |
| `COWAI_AUTO_VERIFY_ON_EXECUTE` | Run role verify command after worker execution | `false` | Requires `verifyCommandKey` and repo policy command. |
| `COWAI_AUTO_ACCEPT_ON_EXECUTE` | Auto-accept after auto-submit | `false` | Skips manual PM acceptance. |
| `COWAI_AUTO_INTEGRATE_ON_ACCEPT` | Auto integrate accepted implementation task changes into target branch | `false` | Requires clean target branch checkout and task worktree availability. |
| `COWAI_INTEGRATION_TARGET_BRANCH` | Branch name for auto integration | `main` | Integration runs via `git cherry-pick` in worker repo root. |
| `COWAI_ENABLE_WORKFLOW_EXECUTION` | Enable execution flags in `runStoryWorkflow` (`autoExecute`, `autoVerify`, `planningAutoAccept`, `baseBranch`) | `false` | When disabled, `runStoryWorkflow` is planning-only. |

## Planning Bridge Flow
1. Human sends story via Codex.
2. Codex calls `runStoryWorkflow`.
3. Planning phase returns clarification questions.
4. Human answers via Codex; Codex calls `runStoryWorkflow` again with `answers`.
5. Tasks are decomposed into backlog (`todo`).
6. Development claims/executes backlog tasks (`claimTask`) and submits to review (`submitTask`).
7. TechLead reviews quality in `in_review`, then PM reviews acceptance criteria in `wait_accept`.
8. TechLead merges `accepted` tasks into target branch.
9. Reviewers finalize each task:
   - `acceptTask` for completion
   - `rejectTask` to send back for rework
10. Human accepts story outcome; if insufficient, submits follow-up story.

## Worker Quick Steps
1. Worker claims a `todo`/`rejected` task with `claimTask` and starts implementation.
2. Worker implements changes in the assigned task scope and validates locally as needed.
3. Worker sends the handoff with `submitTask` (`doing` -> `in_review`).
4. TechLead reviews quality and accepts (`in_review` -> `wait_accept`) or rejects (`-> rejected`).
5. PM reviews acceptance criteria and accepts (`wait_accept` -> `accepted`) or rejects (`-> rejected`).
6. TechLead merges accepted task (`accepted` -> `done`).

## Multi-Terminal Monitoring
- Terminal A: submit stories/tasks (`runStoryWorkflow`).
- Terminal B: monitor `activityLog` and `status`.
- Terminal C: inspect worktree diffs and apply patches.

## Budget Tips
- Poll `activityLog`/`status` every 15-30s instead of continuously.
- Reuse a single `status` snapshot before follow-up actions.
- Skip redundant LLM calls when no new inputs are available.
