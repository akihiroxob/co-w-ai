export type Worker = {
  agentId: string; // "B1", "B2" etc
  repoPath: string; // absolute or relative
  worktreeRoot: string; // e.g. <repo>/.worktrees
  codexCmd: string; // default: "codex"
};
