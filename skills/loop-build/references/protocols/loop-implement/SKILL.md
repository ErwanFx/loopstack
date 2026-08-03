---
name: loop-implement
description: Use when an AI Loop implementation plan has received explicit approval and is ready to be built within its authorized scope.
---

# Implement a Loop

## Gate

Require the approved plan, approval record, environment, and matching plan hash. Recompute the hash before any mutation. Stop on expiry, mismatch, missing permission, new action, or material plan change.

## Build

Implement task by task with tests first. Create only listed files, skills, schemas, native-connection instructions, triggers, approvals, alerts, and runtime packages. Keep triggers disabled. Record commands, outputs, commits, and deviations. Never expand permissions or mutate an external system outside the approved plan.

Finish with a machine-readable implementation manifest containing plan hash, version, artifacts, tests run, unresolved blockers, and exact QA command.

## Handoff

Successful implementation proceeds to `loop-qa`; incomplete work stops with blockers.

```yaml
handoff:
  loop_id: seo-growth
  completed_skill: loop-implement
  status: completed
  artifacts: [implementation-manifest.json]
  next_skill: loop-qa
  blocking_requirements: []
```
