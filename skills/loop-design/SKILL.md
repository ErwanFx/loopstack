---
name: loop-design
description: Use when a process has qualified as an AI Loop and needs a complete, measurable, portable design before implementation planning.
---

# Design a Loop

## Overview

Design the closed control cycle: observe state, assess the gap, decide, act within bounds, measure the result, and learn. Keep business logic host-neutral.

## Design Contract

Define:

- objective, target, current state, gap, run success, and business success;
- manual, cron, webhook, event, API, or queue triggers as appropriate;
- orchestrator agent and required, optional, allowed, forbidden, or missing skills;
- inputs, evidence, decision policy, confidence thresholds, and bounded actions;
- human approvals based on consequence, reversibility, confidence, cost, and permission scope;
- feedback signals, attribution, measurement delay, evaluation, and learning policy;
- budget, maximum iterations, idempotency, retries, stop, escalation, and rollback;
- Hermes as the primary runtime and a Claude Code-compatible representation;
- Convex, Airtable, or Google Sheets storage choice with connection state;
- tools, least-privilege permissions, alert channel, secrets, and failure modes.

Produce the declarative package (`loop.yaml`, process, skills, tools, storage, approvals, alerts, evaluations, tests) without activating it. Re-run the strict readiness gate. Record every unresolved item as blocking or advisory.

## Human Intervention

Require approval for irreversible, public, financial, privacy-sensitive, low-confidence, or out-of-policy actions. Allow autonomous execution only for explicitly bounded and reversible actions. Define who approves, timeout behavior, fallback, and audit evidence.

## Handoff

Send a complete design to `loop-storage-design`. A blocked design stops with missing evidence and does not emit deployable configuration.

```yaml
handoff:
  loop_id: seo-growth
  completed_skill: loop-design
  status: completed
  artifacts: [loop.yaml, process.yaml, approvals.yaml, tests.yaml]
  next_skill: loop-storage-design
  blocking_requirements: []
```
