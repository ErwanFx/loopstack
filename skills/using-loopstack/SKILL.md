---
name: using-loopstack
description: Use when starting, resuming, building, launching, or operating an AI Loop through Loopstack's consolidated workflows.
version: 0.2.0
author: ErwanFx
license: MIT
metadata:
  hermes:
    tags: [ai-loops, orchestration, routing, approvals]
    related_skills: [loop-discover, loop-design, loop-plan, loop-build, loop-launch, loop-operate]
---

# Using Loopstack

## Overview

Loopstack exposes a small, mandatory workflow surface while keeping specialist protocols internal. Check this router before acting on any loop request.

## Public route

```text
loop-discover → loop-design → loop-plan → loop-build → loop-launch → loop-operate
```

- **Discover** proves the process and qualifies it.
- **Design** creates and critically reviews functional and storage blueprints.
- **Plan** defines exact implementation scope and approval.
- **Build** provisions approved foundations, implements, and runs QA.
- **Launch** controls shadow, canary, activation, and rollback.
- **Operate** monitors, debugs, modifies, and improves.

Legacy v1 skill names are internal aliases. Do not expose them as the normal user journey.

## Continuous flow

Follow the Superpowers-style rule:

1. Load the current public workflow before action.
2. Execute its internal protocols continuously.
3. When a valid handoff is `completed`, immediately invoke its `next_skill`.
4. Do not ask “should I continue?” between authorized, non-mutating steps.
5. Stop only at a real gate, unresolved blocker, contradictory instruction, or completion.
6. Keep narration to one short line between tool calls; artifacts and evidence carry the record.

### Real gates

Stop for:

- a business decision that changes target or scope;
- functional or storage blueprint approval;
- an external mutation not covered by an exact approved plan;
- implementation-plan approval;
- activation/deployment approval;
- an unresolved blocker.

Do not stop for:

- loading an internal protocol;
- a read-only connection check;
- deterministic validation;
- QA already included in the approved build plan;
- writing a handoff;
- switching internal steps within one public workflow.

**Approval scope never widens across a transition.** A design approval does not authorize provisioning; a build approval does not authorize activation.

## Resume after interruption or compaction

1. Read the latest machine handoff and referenced artifacts.
2. Validate the handoff with Loopstack.
3. Resolve the executable target through `resolveHandoffTarget()` / `resolve_skill_name()`; never invoke a persisted raw `next_skill` directly.
4. Map any v1 worker name to its public workflow alias.
5. Trust persisted evidence, hashes, and git history over conversational recollection.
6. Resume at the first incomplete internal step; never replay completed mutations.
7. Auto-continue only when all route-specific gate evidence validates against an external trust registry (evidence hash, independently trusted artifact hash, trusted approver). A v1 handoff targeting `loop-build` or `loop-launch` must stop and migrate to v2 first; never use v1 as an authorization downgrade.

Current ECOI compatibility example:

```text
loop-eric-review → loop-plan
```

resolves directly to public `loop-plan`; discovery and design are not repeated.

## Evidence before claims

Before declaring a workflow complete:

1. identify the command or artifact proving completion;
2. run or read it fresh;
3. check exit status, blockers, version, and target environment;
4. make the claim only when fresh verification evidence supports it.

A successful command never proves an unverified external outcome such as message placement or business attribution.

## Handoff

For a new loop, invoke `loop-discover` immediately:

```yaml
handoff:
  route_version: v2
  loop_id: pending
  completed_skill: using-loopstack
  journey: loop-discover
  substage: using-loopstack
  status: completed
  artifacts: []
  next_skill: loop-discover
  next_journey: loop-discover
  completed_workers: [using-loopstack]
  pending_gate: null
  scope_hash: aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa
  artifact_hashes: {}
  gate_evidence: []
  blocking_requirements: []
```
