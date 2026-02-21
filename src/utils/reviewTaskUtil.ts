import { state } from "../libs/state";

const PM_ROLE_PATTERN = /(planning|pm|product manager)/i;
const TL_ROLE_PATTERN = /(tech lead|techlead|architect|\btl\b)/i;

export const findPmAgentId = (): string | undefined => {
  const entries = Object.entries(state.agentRoles);
  const explicitPm = entries.find(([, role]) => role.isPm === true);
  if (explicitPm) return explicitPm[0];
  const matched = entries.find(([, role]) => PM_ROLE_PATTERN.test(role.role));
  return matched?.[0];
};

export const findTechLeadAgentId = (): string | undefined => {
  const entries = Object.entries(state.agentRoles);
  const matched = entries.find(([, role]) => TL_ROLE_PATTERN.test(role.role));
  return matched?.[0];
};
