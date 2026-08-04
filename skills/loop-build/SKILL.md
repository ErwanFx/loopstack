---
name: loop-build
description: Use when an exact Loopstack implementation plan is approved and must be provisioned, built, and validated continuously.
---

# Build and Validate a Loop

## Overview

Execute approved storage setup, implementation, and QA as one continuous workflow. Keep internal procedures atomic and evidence-backed; do not interrupt the user between authorized tasks.

## Internal protocols

Load progressively:

- `references/protocols/loop-storage-setup/SKILL.md`
- `references/protocols/loop-implement/SKILL.md`
- `references/protocols/loop-qa/SKILL.md`

## Hard gate

Before any mutation, call `assertGateAuthorization()` with an external trust context (trusted evidence hash, independently trusted artifact hash, and trusted approver) against the current v2 scope and require:

- `plan-approval` for entry into build;
- a separate `bootstrap-approval` immediately before creating an empty provider boundary;
- a separate `schema-approval` immediately before provisioning schema resources;
- matching plan hash, artifact hash, scope hash, environment, version, permissions, and expiry;
- rollback instructions.

A plan approval never satisfies bootstrap or schema approval, and bootstrap approval never satisfies schema approval. If a required gate is absent, emit an `awaiting-approval` handoff with that exact `pending_gate` and no `next_skill`.

Stop on mismatch, missing permission, expanded scope, ambiguity, or an unapproved external action.

## Process flow

```text
preflight
→ approved storage bootstrap/schema checkpoints
→ TDD implementation tasks
→ automatic QA
→ verified build manifest
→ loop-launch
```

### Storage

Provision only resources listed in the approved plan. Bootstrap and schema may remain separate approval checkpoints. Re-read remote state, verify exact target, run type checks, inventory resources, and prove idempotence. Never infer success from one CLI exit.

### Implementation

For each task:

1. mark it in progress in the persistent ledger;
2. write and run the failing test;
3. implement the smallest approved change;
4. run the focused test and relevant suite;
5. record evidence and commit;
6. continue without asking “should I continue?”.

After compaction, trust the ledger, plan hash, manifests, and git history; never replay a completed mutation.

Build and prove the work-item state machine separately from the prompt-cycle controller. The runtime path must perform actual repeated maker/checker invocations from persisted `AgentRunRequest` snapshots; a cron or workflow definition alone is incomplete. Test bounded continuation, wait termination, controller resume, revision conflicts, idempotency, no-progress, cost/deadline limits, and unknown-side-effect reconciliation.

### QA

Run QA automatically after implementation. Validate manifests, connections, storage, permissions, idempotency, alerts, maker/checker correction, controller resume, work-item transitions and SLAs, scenarios, shadow/canary simulation, failure recovery, and unresolved blockers. A score cannot override a blocker.

## Stop conditions

Stop only for:

- failed or ambiguous mutation reconciliation;
- plan conflict or material scope change;
- mandatory QA blocker;
- missing external evidence requiring the owner;
- completion.

Do not activate triggers or deploy from this workflow.

## Continuous transition

A fresh machine-readable QA `pass` invokes `loop-launch` automatically. A blocked QA report stops without a next skill.

## Handoff

```yaml
handoff:
  route_version: v2
  loop_id: seo-growth
  completed_skill: loop-build
  journey: loop-build
  substage: loop-build
  status: completed
  artifacts: [implementation-manifest.json, qa-report.json, qa-report.md]
  next_skill: loop-launch
  next_journey: loop-launch
  completed_workers: [loop-build]
  pending_gate: null
  scope_hash: aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa
  artifact_hashes:
    qa-report.json: cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc
  gate_evidence:
    - gate: qa-pass
      artifact: qa-report.json
      artifact_hash: cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc
      scope_hash: aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa
      approved_by: independent-qa
      approved_at: 2026-08-03T20:00:00Z
      expires_at: 2099-01-01T00:00:00Z
  blocking_requirements: []
```
