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
4. Confirm the alert delivery channel with a separately authorized safe test. A scheduler acceptance, successful agent run, or consumed one-shot job is **not delivery proof**. Require evidence of the actual destination channel and thread placement (for Slack: expected channel ID and whether a thread timestamp/topic was used), or explicit recipient confirmation. If the user asks to stop testing and wait for a webhook, mark the blocker `paused_pending_webhook` and do not retry.
5. Redact tokens, API keys, secrets, passwords, cookies, URLs containing credentials, and personal data from evidence.
6. Evaluate the evidence with Loopstack's connection gate.

Missing capability or authentication blocks with exact recovery steps. If the native capability is authenticated but the **approved target container/project does not exist**, generate an exact, hashed **bootstrap proposal** (provider account/team, project/container name, environment/deployment, commands, rollback, expiry) and return it to the `loop-design` orchestrator. Do not provision it here. Bootstrap remains an internal `loop-build` operation after the implementation plan is approved and after a separate `bootstrap-approval` is verified against the same scope hash.

Missing read access on an existing target, schema-write permission, tested alerts, or redacted evidence is blocking. Do not provision resources merely to prove that provisioning works.

## Return to the design orchestrator

This protocol never emits a public handoff and never invokes `loop-storage-setup`.

- Existing target ready: attach `connection-report.json` and continue the remaining read-only design checks.
- Target absent: attach the hashed bootstrap proposal, mark `bootstrap-approval` as a future build gate, and continue design only if the storage contract can still be reviewed.
- Authentication or required access absent: return a blocker with exact recovery steps.

The only public transition after all functional design, storage design, connection evidence, and independent review pass is `loop-design → loop-plan`. Provisioning cannot start before the approved plan.
