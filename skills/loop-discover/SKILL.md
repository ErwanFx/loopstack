---
name: loop-discover
description: Use when a new or materially changed process must be evidenced, classified, and checked for AI Loop readiness.
---

# Discover a Loop

## Overview

Combine discovery and qualification into one natural conversation. Do not expose `loop-idea` and `loop-qualify` as separate user steps.

## Internal protocols

Load only when needed:

- `references/protocols/loop-idea/SKILL.md` — evidence-led interview and source checks;
- `references/protocols/loop-qualify/SKILL.md` — classification and activation readiness.

## Process

1. Inspect existing context, artifacts, systems, and the last real unit of work.
2. Ask one question at a time only when evidence cannot be retrieved.
3. Verify named systems and pull a real baseline sample where possible.
4. Define outcome, source of truth, current state, horizon, constraints, owner, and human gates.
5. Compare at least two approaches, including a simpler non-loop option.
6. Classify the process.
7. If it is an AI Loop, run readiness immediately.
8. Write discovery, qualification, readiness, runtime-skill map, and one consolidated handoff.

Readiness blockers prevent activation, not design. State that distinction clearly.

## Continuous transition

If classified as an AI Loop, automatically invoke `loop-design`. Do not ask permission merely to change skills; design is non-mutating.

Stop only when:

- the classification is not an AI Loop;
- a business decision is genuinely missing;
- source evidence is inaccessible and prevents honest classification;
- the user pauses or rejects the direction.

## Completion criteria

- classification is explicit and evidenced;
- baseline is measured, qualified as estimated, or explicitly unknown;
- sources of truth and activation blockers are named;
- v1 human gates and progressive autonomy criteria are captured;
- no storage, trigger, or external system was mutated.

## Handoff

```yaml
handoff:
  route_version: v2
  loop_id: seo-growth
  completed_skill: loop-discover
  journey: loop-discover
  substage: loop-discover
  status: completed
  artifacts: [discovery.yaml, qualification.yaml, candidate.readiness.yaml]
  next_skill: loop-design
  next_journey: loop-design
  completed_workers: [loop-discover]
  pending_gate: null
  scope_hash: aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa
  artifact_hashes: {}
  gate_evidence: []
  blocking_requirements: []
```
