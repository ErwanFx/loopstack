---
name: loop-plan
description: Use when an approved Loopstack design is ready for an exact, versioned implementation plan and authorization boundary.
---

# Plan a Loop

## Overview

Translate the approved design into an executable TDD plan. Planning is non-mutating; approval applies only to the listed version, files, environments, permissions, and external actions.

## Plan requirements

Include:

1. approved design and artifact hashes;
2. target/current/gap and activation readiness;
3. exact files, protocols, scripts, schemas, tests, and versions;
4. storage bootstrap/schema tasks moved from design into build;
5. tools, secrets, least privilege, triggers, webhooks, and delivery channels;
6. human gates and separately approved mutation checkpoints;
7. unit, contract, failure, alert, idempotency, shadow, canary, rollback, and E2E tests;
8. monitoring, ownership, budgets, recovery, and kill switch;
9. exact out-of-scope actions.
10. work-item state machine, optimistic revision, idempotent resume triggers, and waiting-state SLAs;
11. prompt-cycle controller requests/results/checkpoints, maker/checker permissions, limits, reconciliation, and restart behavior;
12. governed learning-proposal tests and runtime-specific mutable target.

## Task sizing

Inspired by Superpowers:

- each task produces an independently testable deliverable;
- name exact files and commands;
- write the failing test first;
- state expected RED and GREEN evidence;
- include interfaces consumed and produced;
- use small commits;
- remove placeholders such as TBD, “add tests”, or “handle errors”.

## Self-review

Before presenting the plan:

- map every approved requirement to a task;
- scan for placeholders and contradictions;
- verify type, field, hash, path, and environment consistency;
- verify every external mutation has an approval boundary and rollback;
- verify build cannot silently activate the loop.

## Hard gate

Present the complete plan and stop for explicit approval. Do not implement, provision, connect, schedule, publish, or activate.

While waiting:

```yaml
handoff:
  route_version: v2
  loop_id: seo-growth
  completed_skill: loop-plan
  journey: loop-plan
  substage: loop-plan
  status: awaiting-approval
  artifacts: [implementation-plan.md, implementation-plan.sha256]
  next_skill: null
  next_journey: loop-build
  completed_workers: [loop-plan]
  pending_gate: plan-approval
  scope_hash: aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa
  artifact_hashes: {}
  gate_evidence: []
  blocking_requirements: [explicit implementation approval]
```

## Continuous transition

After exact approval and hash verification, invoke `loop-build` automatically. Do not ask a second “continue?” question.

## Handoff

```yaml
handoff:
  route_version: v2
  loop_id: seo-growth
  completed_skill: loop-plan
  journey: loop-plan
  substage: loop-plan
  status: completed
  artifacts: [implementation-plan.md, implementation-plan.sha256, implementation-approval.yaml]
  next_skill: loop-build
  next_journey: loop-build
  completed_workers: [loop-plan]
  pending_gate: null
  scope_hash: aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa
  artifact_hashes:
    implementation-approval.yaml: bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb
  gate_evidence:
    - gate: plan-approval
      artifact: implementation-approval.yaml
      artifact_hash: bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb
      scope_hash: aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa
      approved_by: owner
      approved_at: 2026-08-03T20:00:00Z
      expires_at: 2099-01-01T00:00:00Z
  blocking_requirements: []
```
