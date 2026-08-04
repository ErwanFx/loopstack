---
name: loop-design
description: Use when a qualified AI Loop needs functional and storage blueprints, connection checks, and critical review before planning.
---

# Design a Loop

## Overview

Produce one coherent architecture phase with two visual owner gates. Functional design, storage design, read-only connection checks, and Eric critical review are internal protocols—not separate user journeys.

## Internal protocols

Load progressively:

- `references/protocols/functional-design.md`
- `references/protocols/loop-storage-design/SKILL.md`
- `references/protocols/loop-connection-check/SKILL.md`
- `references/protocols/loop-eric-review/SKILL.md`
- `references/protocols/loop-eric-review/references/eric-siu-checklist.md`
- `references/runtime-learning.md`

## Hard gate

Do not implement, provision storage, create cloud resources, schedule triggers, publish, or activate during design.

For new loops, a missing storage target becomes a planned build task. Design may only perform read-only connection checks.

## Process flow

```text
functional draft
→ functional critical self-review
→ functional HTML approval
→ storage draft
→ read-only connection check
→ full Eric review
→ targeted corrections
→ storage HTML approval
→ loop-plan
```

### Functional blueprint

Use exactly:

```text
Target → Observe → Evaluate → Act → Learn → Decide
```

Show sources of truth, target/current/gap, triggers, actions, human gates, runtime skills, feedback horizons, limits, rollout, and the runtime-selected Learn adapter.

Use the runtime capability map in `references/runtime-learning.md`. Prefer the runtime's native diagram skill when available; otherwise produce a self-contained HTML/SVG fallback with its normal file-generation tools.

Present the HTML blueprint and stop for explicit approval. Changes stay within this workflow.

### Storage blueprint

Define entities, operations, retention, permissions, idempotency, audit evidence, exclusions, provider choice, and isolation from business systems of record. Present the HTML blueprint and stop for explicit approval.

### Integrated critical review

Before closing design, challenge attribution, live scheduler drift, alert placement, shadow/canary/recovery, human control, limits, operability, and learning. Fix exact defects internally before presentation whenever possible.

If review materially changes an already-approved functional component, request targeted reapproval. Do not reopen unchanged components.

A design can pass to planning while activation remains blocked only when every blocker has an owner, acceptance criteria, verification task, and gate preventing premature activation.

## Continuous transition

After both owner approvals and a passing design review, invoke `loop-plan` automatically. Do not ask whether to launch the next skill.

## Completion criteria

- both visual blueprints approved;
- design review verdict recorded separately from activation readiness;
- every blocker has a treatment contract;
- no external mutation occurred;
- machine handoff points directly to `loop-plan`.

## Handoff

```yaml
handoff:
  route_version: v2
  loop_id: seo-growth
  completed_skill: loop-design
  journey: loop-design
  substage: loop-design
  status: completed
  artifacts: [design/loop.yaml, design/ai-loop-blueprint.html, storage.yaml, storage-design-blueprint.html, design-review.yaml, design-approval.yaml, storage-approval.yaml]
  next_skill: loop-plan
  next_journey: loop-plan
  completed_workers: [loop-design]
  pending_gate: null
  scope_hash: aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa
  artifact_hashes:
    design-approval.yaml: bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb
    storage-approval.yaml: cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc
  gate_evidence:
    - gate: design-approval
      artifact: design-approval.yaml
      artifact_hash: bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb
      scope_hash: aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa
      approved_by: owner
      approved_at: 2026-08-03T20:00:00Z
      expires_at: 2099-01-01T00:00:00Z
    - gate: storage-approval
      artifact: storage-approval.yaml
      artifact_hash: cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc
      scope_hash: aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa
      approved_by: owner
      approved_at: 2026-08-03T20:00:00Z
      expires_at: 2099-01-01T00:00:00Z
  blocking_requirements: []
```
