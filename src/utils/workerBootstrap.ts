import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import YAML from "yaml";
import { workers } from "../libs/workers";
import { Worker } from "../types/Worker";
import { ensureDir } from "./fsUtil";
import { applyAgentRoles } from "./agentRoleUtil";
import { AgentRoleProfile } from "../types/StoryWorkflow";

type WorkerDoc = {
  workers?: Array<{
    agentId?: string;
    repoPath?: string;
    worktreeDirName?: string;
    codexCmd?: string;
    role?: string;
    isPm?: boolean;
    focus?: string;
    personality?: string;
    verifyCommandKey?: string;
  }>;
};

const existsFile = async (p: string) => {
  try {
    const s = await stat(p);
    return s.isFile();
  } catch {
    return false;
  }
};

const resolveWorkersConfigPath = async (cwd: string, filePath?: string) => {
  if (filePath && filePath.trim().length > 0) {
    return path.isAbsolute(filePath) ? filePath : path.resolve(cwd, filePath);
  }

  const workdirConfig = path.resolve(cwd, "settings/workers.yaml");
  if (await existsFile(workdirConfig)) return workdirConfig;

  const orchestratorDefault = path.resolve(__dirname, "../../settings/workers.yaml");
  return orchestratorDefault;
};

export const preloadWorkersFromConfig = async (
  cwd: string,
  filePath?: string,
): Promise<{ path: string; loaded: Worker[]; loadedRoles: AgentRoleProfile[] }> => {
  const targetPath = await resolveWorkersConfigPath(cwd, filePath);

  const text = await readFile(targetPath, "utf8");
  const parsed = (YAML.parse(text) ?? {}) as WorkerDoc;
  const list = parsed.workers ?? [];

  const loaded: Worker[] = [];
  const loadedRoles: AgentRoleProfile[] = [];

  for (const w of list) {
    if (!w.agentId || !w.repoPath) continue;

    const absRepo = path.isAbsolute(w.repoPath) ? w.repoPath : path.resolve(cwd, w.repoPath);
    const wtRoot = path.join(absRepo, w.worktreeDirName ?? ".worktrees");

    const worker: Worker = {
      agentId: String(w.agentId),
      repoPath: absRepo,
      worktreeRoot: wtRoot,
      codexCmd: w.codexCmd ?? process.env.CODEX_CMD ?? "codex",
    };

    await ensureDir(worker.worktreeRoot);
    workers.set(worker.agentId, worker);
    loaded.push(worker);

    if (w.role) {
      loadedRoles.push({
        agentId: worker.agentId,
        role: String(w.role),
        isPm: w.isPm === true,
        focus: w.focus ? String(w.focus) : undefined,
        personality: w.personality ? String(w.personality) : undefined,
        verifyCommandKey: w.verifyCommandKey ? String(w.verifyCommandKey) : undefined,
      });
    }
  }

  if (loadedRoles.length > 0) {
    applyAgentRoles(loadedRoles, true);
  }

  return { path: targetPath, loaded, loadedRoles };
};
