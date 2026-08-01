---
name: loop-connection-check
description: Use when a loop storage provider is selected and its existing Hermes or Claude Code capability must be verified before provisioning.
---

# Check a Native Connection

## Overview

Discover and verify an existing MCP, CLI, skill, or tool. Use the agent's native connection; do not add an embedded provider client.

## Check

1. Identify the runtime, provider, capability kind, and exact tool name.
2. Confirm authentication without displaying credentials.
3. Perform only non-mutating discovery: account or project identity, target container access, read permission, schema metadata access, and schema-write capability.
4. Confirm the alert delivery channel with a separately authorized safe test.
5. Redact tokens, API keys, secrets, passwords, cookies, URLs containing credentials, and personal data from evidence.
6. Evaluate the evidence with Loopstack's connection gate.

Missing capability, authentication, read access, schema-write permission, tested alerts, or redacted evidence is blocking. Do not provision resources to prove that provisioning works.

## Handoff

When the report is `ready`, send it to `loop-storage-setup`. Otherwise stop with exact connection steps for the user.

```yaml
handoff:
  loop_id: seo-growth
  completed_skill: loop-connection-check
  status: completed
  artifacts: [connection-report.json]
  next_skill: loop-storage-setup
  blocking_requirements: []
```
