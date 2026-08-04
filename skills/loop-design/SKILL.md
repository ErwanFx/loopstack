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
- `references/prompt-graph-contract.md` — load only when graph necessity was evidenced;
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
Target → Observe state → Evaluate/Plan → Act → Observe result → Evaluate outcome → Learn → Decide
```

This complete cycle is canonical; a compact six-box summary is explanatory only. Show the pre-action and post-action observation/evaluation moments separately in machine artifacts and detailed visuals.

When the architecture is `workflow-with-control-loop`, put two distinct views in the same owner artifact: the durable business process (`process.yaml`, work-item states, `waiting-human`, `waiting-external`, deadlines) and the agent control loop. Specify the executable maker/checker prompt cycle using versioned `AgentRunRequest` objects and durable checkpoints. A waiting decision ends the current agent run; a later resume trigger starts a new run from stored state.

Show sources of truth, target/current/gap, typed triggers with `enabled: false` and idempotency, actions, typed human gates with timeout behavior, runtime skills, feedback horizons, limits, rollout, and the runtime-selected Learn adapter.

### Optional prompt graph

AI Loop is the product concept; graph engineering is an optional execution technique inside it. Do not create `graph.yaml` by default. Create it only when discovery proved real branching, joins, bounded cycles, parallel work, human waits, or recovery dependencies. Keep topology and prompts separate: `graph.yaml` references versioned prompt files and never embeds long prompts.

Default to one agent profile reused through a fresh session per agent/evaluator node. The same Hermès profile may research, write, and review in different sessions; require a distinct profile only for genuine isolation. For Hermès, use `maxConcurrency: 1` unless a separately tested executor proves profile-safe concurrency. Claude Code dynamic workflows are optional acceleration; Claude Code and Codex must retain a sequential fallback through the Loopstack runner.

Run the fake-edge test: every edge must carry a declared artifact, condition, ordering constraint, or shared-resource dependency. Review/evaluator nodes use fresh context and no consequential write tools. All fan-in is explicit and missing required results fail closed. Evidence anchors are immutable and protected from learning. Improvement is proposal only: the loop never silently changes graph, prompts, skills, gates, permissions, or protected anchors.

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
- execution mode is explicit and `graph.yaml` exists only when justified and compiler-valid.

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
