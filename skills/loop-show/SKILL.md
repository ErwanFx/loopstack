---
name: loop-show
description: Use when one registered AI Loop needs detailed inspection of design, versions, runs, decisions, approvals, alerts, costs, or outcomes.
---

# Show a Loop

## Inspect

Load the canonical manifest and native operational-memory records for the selected `loopId`. Present configuration version, runtime package, storage evidence, lifecycle, health, target/current/gap, latest runs, decisions with evidence, actions and results, approvals, alerts, costs, learnings, and scheduled follow-ups.

Flag manifest drift, unregistered runtime records, stale heartbeats, incomplete measurements, unknown side effects, and version mismatches. Do not mutate state.

## Handoff

Route operational follow-up to `loop-monitor`.

```yaml
handoff:
  loop_id: seo-growth
  completed_skill: loop-show
  status: completed
  artifacts: [loop-detail.json]
  next_skill: loop-monitor
  blocking_requirements: []
```
