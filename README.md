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
Use only `settings/workers.yaml` for MCP-side configuration.
Each worker entry can include both runtime and role profile fields:
- runtime: `agentId`, `repoPath`, `worktreeDirName`, `codexCmd`
- role profile: `role`, `focus`, `personality`, `verifyCommandKey`

No split config is required.

## Worker Boot
- Default config file: `settings/workers.yaml`
- Optional override: `COWAI_WORKERS_FILE`
- Workers and role profiles are preloaded at startup.
- `spawnWorker` is for temporary/manual registration when needed.

## Task Status
- `todo` -> `doing` -> `wait_accept` -> `done`
- `blocked` is used when execution/verification fails.
- `wait_accept` is accepted by Planning flow (default) or manually via `acceptTask`.

## Async Run API (recommended)
- `startRunWorkerTask`: start execution and get `runId` immediately.
- `getRunStatus`: poll by `runId`.
- `listRuns`: list/filter runs by task/agent/status.
- `activityLog`: filter by `runId` and use `format=lines` for terminal viewing.

## Planning Bridge Flow
1. Human sends story via Codex.
2. Codex calls `runStoryWorkflow`.
3. Planning phase returns clarification questions.
4. Human answers via Codex; Codex calls `runStoryWorkflow` again with `answers`.
5. Tasks are decomposed and executed by workers.
6. Planning flow accepts completed subtasks (`wait_accept` -> `done`).
7. Human accepts story outcome; if insufficient, submits follow-up story.

## Multi-Terminal Monitoring
- Terminal A: submit stories/tasks (`runStoryWorkflow`, `startRunWorkerTask`).
- Terminal B: monitor `activityLog` and `status`.
- Terminal C: inspect worktree diffs and apply patches.

## Budget Tips
- Poll `activityLog`/`status` every 15-30s instead of continuously.
- Reuse a single `status` snapshot before follow-up actions.
- Skip redundant LLM calls when no new inputs are available.
