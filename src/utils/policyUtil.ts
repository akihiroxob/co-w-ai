import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import YAML from "yaml";
import { policyCache } from "../libs/policyCache";
import type { RepoPolicy } from "../types/RepoPolict";

const existsFile = async (p: string) => {
  try {
    const s = await stat(p);
    return s.isFile();
  } catch {
    return false;
  }
};

const resolvePolicyPath = async (repoPath: string) => {
  const repoPolicy = path.join(repoPath, ".agent", "policy.yaml");
  if (await existsFile(repoPolicy)) return repoPolicy;

  const workdirPolicy = path.resolve(process.cwd(), "settings/default.policy.yaml");
  if (await existsFile(workdirPolicy)) return workdirPolicy;

  const orchestratorDefault = path.resolve(__dirname, "../../settings/default.policy.yaml");
  return orchestratorDefault;
};

export const loadRepoPolicy = async (repoPath: string, refresh = false): Promise<RepoPolicy> => {
  if (refresh) policyCache.delete(repoPath);

  const cached = policyCache.get(repoPath);
  if (cached) return cached;

  const filePath = await resolvePolicyPath(repoPath);
  const text = await readFile(filePath, "utf8");
  const parsed = YAML.parse(text) as RepoPolicy;

  const policy: RepoPolicy = parsed ?? {};
  policyCache.set(repoPath, policy);
  return policy;
};
