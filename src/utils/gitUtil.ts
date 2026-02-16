import path from "node:path";
import { execCommandCapture } from "./shellUtil";
import { writeFile } from "node:fs/promises";
import { Worker } from "../types/Worker";
import { CommandResult } from "../types/CommandResult";

export const safeBranchName = (s: string) => {
  return s.replace(/[^a-zA-Z0-9._-]+/g, "-").slice(0, 80);
};

export const taskBranchName = (agentId: string, taskId: string) => {
  return `agent/${agentId}/${safeBranchName(taskId)}`;
};

// worktree path helper from task id
export const worktreePathFor = (worker: Worker, agentId: string, taskId: string) => {
  return path.join(worker.worktreeRoot, `${agentId}__${safeBranchName(taskId)}`);
};

export const applyPatchInDir = async (patchText: string, cwd: string): Promise<CommandResult> => {
  const patchFile = path.join(cwd, ".mcp_patch.diff");
  await writeFile(patchFile, patchText, "utf8");
  // --whitespace=nowarn は好み。MVPなので緩め
  const res = await execCommandCapture(`git apply --whitespace=nowarn "${patchFile}"`, cwd);
  return res;
};

const shellQuote = (v: string) => {
  return `"${v.replace(/(["\\$`])/g, "\\$1")}"`;
};

const parseWorktreeList = (text: string) => {
  const blocks = text
    .trim()
    .split(/\n\n+/)
    .map((b) => b.split("\n").map((l) => l.trim()))
    .filter((lines) => lines.length > 0);

  return blocks.map((lines) => {
    const worktree = lines.find((l) => l.startsWith("worktree "))?.slice("worktree ".length) ?? "";
    const branch = lines.find((l) => l.startsWith("branch "))?.slice("branch ".length) ?? "";
    return { worktree, branch };
  });
};

export const validateTaskWorktree = async (worker: Worker, agentId: string, taskId: string) => {
  const wtPath = worktreePathFor(worker, agentId, taskId);
  const branch = taskBranchName(agentId, taskId);

  const list = await execCommandCapture("git worktree list --porcelain", worker.repoPath);
  if (!list.ok) {
    return {
      ok: false,
      error: "WORKTREE_LIST_FAILED",
      branch,
      worktreePath: wtPath,
      detail: list,
    };
  }

  const attached = parseWorktreeList(list.stdout).find((w) => path.resolve(w.worktree) === path.resolve(wtPath));
  if (!attached) {
    return {
      ok: false,
      error: "WORKTREE_NOT_FOUND",
      branch,
      worktreePath: wtPath,
      detail: list,
    };
  }

  const branchRes = await execCommandCapture("git rev-parse --abbrev-ref HEAD", wtPath);
  if (!branchRes.ok) {
    return {
      ok: false,
      error: "WORKTREE_BRANCH_CHECK_FAILED",
      branch,
      worktreePath: wtPath,
      detail: branchRes,
    };
  }

  const currentBranch = branchRes.stdout.trim();
  if (currentBranch !== branch) {
    return {
      ok: false,
      error: "WORKTREE_BRANCH_MISMATCH",
      branch,
      worktreePath: wtPath,
      currentBranch,
      detail: branchRes,
    };
  }

  return {
    ok: true,
    branch,
    worktreePath: wtPath,
  };
};

export const ensureTaskWorktree = async (worker: Worker, agentId: string, taskId: string) => {
  const valid = await validateTaskWorktree(worker, agentId, taskId);
  if (valid.ok) return valid;

  if (valid.error !== "WORKTREE_NOT_FOUND") {
    return valid;
  }

  const create = await execCommandCapture(
    `git worktree add -b ${shellQuote(valid.branch)} ${shellQuote(valid.worktreePath)} HEAD`,
    worker.repoPath,
  );
  if (!create.ok) {
    return {
      ok: false,
      error: "WORKTREE_CREATE_FAILED",
      branch: valid.branch,
      worktreePath: valid.worktreePath,
      detail: create,
    };
  }

  return await validateTaskWorktree(worker, agentId, taskId);
};

function isSubPath(parent: string, child: string) {
  const rel = path.relative(parent, child);
  return rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel));
}

export const resolveCwdWithinRepo = (repoPath: string, cwd?: string) => {
  const abs = cwd ? (path.isAbsolute(cwd) ? cwd : path.resolve(repoPath, cwd)) : repoPath;

  if (!isSubPath(repoPath, abs)) {
    throw new Error(`CWD must be inside repo. repo=${repoPath}, cwd=${abs}`);
  }

  return abs;
};
