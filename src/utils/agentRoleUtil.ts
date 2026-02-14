import path from "node:path";
import { readFile } from "node:fs/promises";
import YAML from "yaml";
import { AgentRoleProfile } from "../types/StoryWorkflow";
import { state } from "../libs/state";

type ParsedRolesDoc = {
  agents?: Array<{
    agentId?: string;
    role?: string;
    focus?: string;
    verifyCommandKey?: string;
  }>;
};

const extractFrontmatter = (text: string): string | null => {
  const normalized = text.replace(/^\uFEFF/, "");
  const m = normalized.match(/^---\n([\s\S]*?)\n---(?:\n|$)/);
  return m ? m[1] : null;
};

export const resolveRolesFilePath = (repoPath: string, filePath?: string) => {
  if (!filePath || filePath.trim().length === 0) {
    return path.join(repoPath, ".agent", "roles.md");
  }
  return path.isAbsolute(filePath) ? filePath : path.resolve(repoPath, filePath);
};

export const loadAgentRolesFromMarkdown = async (
  repoPath: string,
  filePath?: string,
): Promise<{ path: string; roles: AgentRoleProfile[] }> => {
  const targetPath = resolveRolesFilePath(repoPath, filePath);
  const text = await readFile(targetPath, "utf8");
  const frontmatter = extractFrontmatter(text);

  if (!frontmatter) {
    throw new Error("roles.md frontmatter is missing");
  }

  const parsed = (YAML.parse(frontmatter) ?? {}) as ParsedRolesDoc;
  const agents = parsed.agents ?? [];

  const roles: AgentRoleProfile[] = agents
    .filter((a) => a.agentId && a.role)
    .map((a) => ({
      agentId: String(a.agentId),
      role: String(a.role),
      focus: a.focus ? String(a.focus) : undefined,
      verifyCommandKey: a.verifyCommandKey ? String(a.verifyCommandKey) : undefined,
    }));

  if (roles.length === 0) {
    throw new Error("No valid agents found in roles.md frontmatter");
  }

  return { path: targetPath, roles };
};

export const loadDefaultAgentRoles = async (
  cwd: string,
  filePath?: string,
): Promise<{ path: string; roles: AgentRoleProfile[] }> => {
  const targetPath = filePath
    ? path.isAbsolute(filePath)
      ? filePath
      : path.resolve(cwd, filePath)
    : path.resolve(cwd, "settings/default.roles.md");

  const text = await readFile(targetPath, "utf8");
  const frontmatter = extractFrontmatter(text);

  if (!frontmatter) {
    throw new Error("default roles frontmatter is missing");
  }

  const parsed = (YAML.parse(frontmatter) ?? {}) as ParsedRolesDoc;
  const agents = parsed.agents ?? [];
  const roles: AgentRoleProfile[] = agents
    .filter((a) => a.agentId && a.role)
    .map((a) => ({
      agentId: String(a.agentId),
      role: String(a.role),
      focus: a.focus ? String(a.focus) : undefined,
      verifyCommandKey: a.verifyCommandKey ? String(a.verifyCommandKey) : undefined,
    }));

  if (roles.length === 0) {
    throw new Error("No valid agents found in default roles");
  }

  return { path: targetPath, roles };
};

export const applyAgentRoles = (roles: AgentRoleProfile[], replaceAll = false) => {
  if (replaceAll) {
    state.agentRoles = {};
  }

  for (const role of roles) {
    state.agentRoles[role.agentId] = role;
  }
};
