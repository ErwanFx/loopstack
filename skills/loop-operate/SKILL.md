---
name: loop-operate
description: Use when a Loopstack loop must be inspected, monitored, debugged, modified, or improved from measured evidence.
---

# Operate a Loop

## Overview

Present one coherent operating interface. Select the internal protocol from evidence instead of asking the user to choose among registry, monitor, debug, modify, or improve skills.

## Internal protocols

Load only the branch needed:

- `references/protocols/loop-list/SKILL.md` and `loop-show` — inventory and inspection;
- `references/protocols/loop-monitor/SKILL.md` — health and outcome review;
- `references/protocols/loop-debug/SKILL.md` — failures and ambiguity;
- `references/protocols/loop-modify/SKILL.md` — requested structural change;
- `references/protocols/loop-improve/SKILL.md` — evidence-backed optimization.

## Route by evidence

- “List/show/status” → inspect and report without mutation.
- Healthy measurable opportunity → propose an improvement experiment.
- Requested gate/tool/storage/threshold change → produce semantic diff.
- Failure, ambiguous side effect, stale heartbeat, or regression → debug first.
- Consequential change → route to `loop-plan`; never mutate silently.

## Continuous operation

Read-only monitoring and inspection remain inside `loop-operate`; do not announce internal skill transitions. Record canonical health, version, target/current/gap, costs, pending approvals, alerts, follow-ups, and learnings. For durable processes, report work-item SLA compliance, state distribution, overdue `waiting-human` and `waiting-external` cases, pending gates, revision conflicts, and resume failures.

For incidents, reconstruct the timeline and classify side effects as completed, failed, or unknown. Reconcile unknown outcomes before retrying.

For learning, require enough completed feedback windows. Link every proposal to evidence, expected metric change, experiment, risk, rollback, and success threshold. Do not optimize proxy volume over the business outcome.

Operational learning is mandatory; self-modification is optional. Record observations and evaluations on every run, but change reusable behavior only through the lifecycle `proposed → validated → approved → promoted`, with rejection and rollback paths. Treat plugin-provided skills as read-only; a promoted Hermes learning proposal targets a separate mutable per-loop or project skill.

## Gates

Stop for:

- a consequential modification requiring a new plan;
- an unresolved incident needing owner action;
- missing external evidence;
- an activation-stage change;
- completion of the requested report.

## Handoff

Read-only continuation may remain in `loop-operate`:

```yaml
handoff:
  route_version: v2
  loop_id: seo-growth
  completed_skill: loop-operate
  journey: loop-operate
  substage: loop-operate
  status: completed
  artifacts: [health-report.json]
  next_skill: loop-operate
  next_journey: loop-operate
  completed_workers: [loop-operate]
  pending_gate: null
  scope_hash: aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa
  artifact_hashes: {}
  gate_evidence: []
  blocking_requirements: []
```

A structural change routes to planning:

```yaml
handoff:
  route_version: v2
  loop_id: seo-growth
  completed_skill: loop-operate
  journey: loop-operate
  substage: loop-operate
  status: completed
  artifacts: [change-proposal.json]
  next_skill: loop-plan
  next_journey: loop-plan
  completed_workers: [loop-operate]
  pending_gate: null
  scope_hash: aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa
  artifact_hashes: {}
  gate_evidence: []
  blocking_requirements: []
```
