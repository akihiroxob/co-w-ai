# Repository Guidelines

## Project Structure & Module Organization
- `src/index.ts` starts the MCP orchestrator and preloads default roles.
- `src/tools/` contains MCP tool handlers (one file per tool), including workflow tools such as `runStoryWorkflow.ts`, `loadAgentRoles.ts`, and `activityLog.ts`.
- `src/utils/` provides shared helpers (`agentRoleUtil.ts`, `workflowUtil.ts`, git/shell/policy helpers).
- `src/libs/` stores in-memory runtime state (`tasks`, `workflows`, `agentRoles`, activity logs).
- `src/types/` holds shared type declarations.
- `settings/default.roles.md` defines global default agent roles loaded at startup.
- Repository-specific overrides live at `<repo>/.agent/roles.md`.
- `build/` is compiled output; do not edit directly.

## Build, Test, and Development Commands
- `pnpm install`: install dependencies.
- `pnpm build`: compile TypeScript into `build/`.
- `pnpm start`: run the MCP server over stdio.
- `pnpm debug`: run with MCP inspector.

Quick local check:
```bash
pnpm build && pnpm start
```

## Coding Style & Naming Conventions
- Language: TypeScript (strict mode), ESM-style imports.
- Indentation: 2 spaces.
- File naming: camelCase (for example `loadAgentRoles.ts`).
- Prefer small, focused tool handlers returning `content` and `structuredContent`.
- Keep side effects explicit (state updates + activity logs).

## Testing Guidelines
- No automated test script exists yet.
- Required validation for changes:
  - `pnpm build` passes
  - Manual MCP flow check for affected tools
- For workflow changes, verify this path:
  1. `spawnWorker`
  2. `loadAgentRoles` (or rely on auto loading)
  3. `runStoryWorkflow` with `story`
  4. answer returned questions
  5. inspect `status` and `activityLog`

## Commit & Pull Request Guidelines
- Use imperative, specific commit subjects (for example `add startup default role preload`).
- Keep PRs focused; include changed files, why, and local verification steps/results.
- Link related task/issue IDs when available.

## Security & Configuration Tips
- Keep `<repo>/.agent/policy.yaml` allowlists minimal.
- Default role load order: `settings/default.roles.md` -> `COWAI_DEFAULT_ROLES_FILE` (optional path) -> repo override via `<repo>/.agent/roles.md`.
