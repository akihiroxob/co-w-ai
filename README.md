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

## Task Status
- `todo` -> `doing` -> `wait_accept` -> `done`
- `blocked` is used when execution/verification fails.
- development handoff:
  - `claimTask` (`todo` -> `doing`)
  - `submitTask` (`doing` -> `wait_accept`)
- `wait_accept` is reviewed by PM/planning:
  - accept: `acceptTask` (`wait_accept` -> `done`)
  - reject: `rejectTask` (`wait_accept` -> `todo`)

## PM Gateway
- Route all requests through `runStoryWorkflow` (PM/planning gateway).
- Use `activityLog` for execution monitoring.

## Planning Bridge Flow
1. Human sends story via Codex.
2. Codex calls `runStoryWorkflow`.
3. Planning phase returns clarification questions.
4. Human answers via Codex; Codex calls `runStoryWorkflow` again with `answers`.
5. Tasks are decomposed into backlog (`todo`).
6. Development claims/executes backlog tasks (`claimTask`) and submits to review (`submitTask`).
7. PM reviews each task:
   - `acceptTask` for completion
   - `rejectTask` to send back for rework
8. Human accepts story outcome; if insufficient, submits follow-up story.

## Multi-Terminal Monitoring
- Terminal A: submit stories/tasks (`runStoryWorkflow`).
- Terminal B: monitor `activityLog` and `status`.
- Terminal C: inspect worktree diffs and apply patches.

## Budget Tips
- Poll `activityLog`/`status` every 15-30s instead of continuously.
- Reuse a single `status` snapshot before follow-up actions.
- Skip redundant LLM calls when no new inputs are available.
