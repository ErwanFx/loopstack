---
name: loop-modify
description: Use when an existing AI Loop process, approval, threshold, tool, storage, alert, trigger, or runtime behavior must change.
---

# Modify a Loop

## Analyze

Compare the canonical current version with the requested version. Produce a semantic diff with changed paths, old/new values, risk, permissions, migrations, affected scenarios, rollout impact, and running-version pins.

Do not edit generated runtime wrappers directly. Do not mutate the current loop. Approval removal, permission expansion, storage migration, public actions, or alert weakening are high-risk structural changes.

Create a new version proposal and required QA matrix. Running executions remain pinned to their starting version.

## Handoff

Send the semantic diff and proposal to `loop-plan` for a new plan and approval.

```yaml
handoff:
  loop_id: seo-growth
  completed_skill: loop-modify
  status: completed
  artifacts: [semantic-diff.json, version-proposal.yaml]
  next_skill: loop-plan
  blocking_requirements: []
```
