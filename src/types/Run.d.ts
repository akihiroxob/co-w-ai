export type RunStatus = "queued" | "running" | "succeeded" | "failed" | "canceled";

export type RunRecord = {
  runId: string;
  taskId: string;
  agentId: string;
  status: RunStatus;
  createdAt: string;
  updatedAt: string;
  startedAt?: string;
  finishedAt?: string;
  baseBranch?: string;
  branch?: string;
  worktreePath?: string;
  summary?: string;
  result?: unknown;
  error?: string;
  cancelRequested?: boolean;
};
