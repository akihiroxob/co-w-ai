---
agents:
  - agentId: "B1"
    role: "backend developer"
    focus: "API design and data integrity"
    verifyCommandKey: "test"
  - agentId: "B2"
    role: "frontend developer"
    focus: "UI behavior and accessibility"
    verifyCommandKey: "lint"
  - agentId: "QA1"
    role: "qa"
    focus: "regression and edge cases"
    verifyCommandKey: "test"
---

# Agent Roles

Define your agent role profiles in YAML frontmatter.
The orchestrator reads `agents` from this block.
