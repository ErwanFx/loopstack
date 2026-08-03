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

Missing capability or authentication blocks with exact recovery steps. If the native capability is authenticated but the **approved target container/project does not exist**, do not tell the owner to create it manually and do not mislabel it as a generic read-permission failure. Generate an exact, hashed **bootstrap plan** (provider account/team, project/container name, environment/deployment, commands, rollback, expiry), request approval, and hand off to `loop-storage-setup` in bootstrap mode. Bootstrap creates only the empty provider container/deployment; it does not create the loop schema. After bootstrap, rerun this connection check before schema provisioning.

Missing read access on an existing target, schema-write permission, tested alerts, or redacted evidence is blocking. Do not provision resources merely to prove that provisioning works outside the approved bootstrap branch.

## Handoff

When the report is `ready`, send it to `loop-storage-setup` for schema provisioning.

When authentication is confirmed but the approved target is absent, emit `convex-bootstrap-plan.json` (or provider equivalent) and send it to `loop-storage-setup` with `mode: bootstrap`, awaiting the exact plan approval. After bootstrap, return to `loop-connection-check`.

```yaml
handoff:
  loop_id: seo-growth
  completed_skill: loop-connection-check
  status: bootstrap-required
  artifacts: [connection-report.json, convex-bootstrap-plan.json]
  next_skill: loop-storage-setup
  mode: bootstrap
  blocking_requirements: [exact_bootstrap_plan_approval]
```

For a ready existing target:

```yaml
handoff:
  loop_id: seo-growth
  completed_skill: loop-connection-check
  status: completed
  artifacts: [connection-report.json]
  next_skill: loop-storage-setup
  mode: schema
  blocking_requirements: []
```
