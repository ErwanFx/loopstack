---
name: loop-list
description: Use when someone needs an inventory of AI Loops across idea, build, shadow, active, inactive, failed, or archived states.
---

# List Loops

## List

Merge canonical Git definitions with native operational-memory summaries. Show ID, name, lifecycle status, runtime, storage, version, health, last run, alerts, approvals, target, and latest gap. Mark runtime-only records `unregistered`; never let runtime health overwrite Git lifecycle metadata.

Support filters for status, health, runtime, storage, owner, and alert state. Listing is read-only.

## Handoff

When the user selects a loop, route to `loop-show`.

```yaml
handoff:
  loop_id: seo-growth
  completed_skill: loop-list
  status: completed
  artifacts: [loop-registry.json]
  next_skill: loop-show
  blocking_requirements: []
```
