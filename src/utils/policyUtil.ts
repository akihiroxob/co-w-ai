import { readFile } from "node:fs/promises";
import path from "node:path";
import YAML from "yaml";
import { policyCache } from "../libs/policyCache";
import type { RepoPolicy } from "../types/RepoPolict";

export const loadRepoPolicy = async (repoPath: string, refresh = false): Promise<RepoPolicy> => {
  if (refresh) policyCache.delete(repoPath);

  const cached = policyCache.get(repoPath);
  if (cached) return cached;

  const filePath = path.join(repoPath, ".agent", "policy.yaml");
  const text = await readFile(filePath, "utf8");
  const parsed = YAML.parse(text) as RepoPolicy;

  const policy: RepoPolicy = parsed ?? {};
  policyCache.set(repoPath, policy);
  return policy;
};
