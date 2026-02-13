import path from "node:path";
import { execCommandCapture } from "./shellUtil";
import { writeFile } from "node:fs/promises";
import { Worker } from "../types/Worker";
import { CommandResult } from "../types/CommandResult";

export const safeBranchName = (s: string) => {
  return s.replace(/[^a-zA-Z0-9._-]+/g, "-").slice(0, 80);
};

// worktreeパスを taskId から復元（runWorkerTask と同じ命名規則）
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
