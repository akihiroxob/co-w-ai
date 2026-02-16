import { AgentRoleProfile } from "../types/StoryWorkflow";
import { state } from "../libs/state";

export const applyAgentRoles = (roles: AgentRoleProfile[], replaceAll = false) => {
  if (replaceAll) {
    state.agentRoles = {};
  }

  for (const role of roles) {
    state.agentRoles[role.agentId] = role;
  }
};
