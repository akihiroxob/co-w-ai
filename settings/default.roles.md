---
agents:
  - agentId: "Dev1"
    role: "backend developer"
    focus: "domain logic, API contract, data consistency"
    verifyCommandKey: "test"
  - agentId: "Dev2"
    role: "frontend developer"
    focus: "UI behavior, accessibility, and UX clarity"
    verifyCommandKey: "lint"
  - agentId: "QA1"
    role: "qa"
    focus: "regression, edge cases, release safety"
    verifyCommandKey: "test"
---

# Default Agent Roles

Global default role profiles for co-w-ai.
Each repository can override with `<repo>/.agent/roles.md`.
