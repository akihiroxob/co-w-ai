# co-w-ai

Story-driven multi-agent orchestrator for collaborative development via MCP tools.

## What it does
- Auto-load default agent roles at server startup.
- Override roles per repository with `<repo>/.agent/roles.md`.
- Accept a development story and generate clarifying questions.
- Decompose clarified stories into tasks and assign by role.
- Run collaborative implementation in git worktrees.
- Verify outputs with policy-based commands.
- Expose agent/system activity logs for observability.

## Build & Run
```bash
pnpm install
pnpm build
pnpm start
```

## Role Loading Priority
1. Startup default roles: `settings/default.roles.md`
2. Optional startup override path: env `COWAI_DEFAULT_ROLES_FILE`
3. Repo override on `spawnWorker`: `<repo>/.agent/roles.md`
4. Manual load: `loadAgentRoles` tool

Repo override and manual load update matching `agentId` entries.

## Reliability Notes
- `runWorkerTask` resolves base branch automatically when omitted:
  - preferred input -> `origin/HEAD` -> `main` -> `master` -> current `HEAD`
- `runWorkerTask` supports `timeoutMs` and returns timeout state in command result (`timedOut`).
- Lifecycle events are written to `activityLog` for start, branch/worktree, codex, verify, diff, and failure.
- `setTaskStatus` blocks `done` when worker provenance/verification requirements are not met.
- `cleanupWorktree` supports `archiveBeforeForce` and `deleteBranch` options.

## MCP Tools (workflow)
- `loadAgentRoles`: load role profiles from markdown (default `<repo>/.agent/roles.md`).
- `runStoryWorkflow`: story intake, clarification, decomposition, execution, verification, reporting.
- `activityLog`: inspect what each agent/system did.
- `status`: global snapshot including workflows, task run metadata, and activity tail.

## Recommended Usage Flow
1. Register workers (`spawnWorker`).
2. (Optional) `loadAgentRoles` if you want explicit role reload.
3. Start with story (`runStoryWorkflow` with `story`).
4. If questions are returned, answer them (`runStoryWorkflow` with `workflowId` + `answers`).
5. Review report and traces (`activityLog` or `status`).

## Policy
Verification uses `<repo>/.agent/policy.yaml` command keys (for example `test`, `lint`, `typecheck`).
