---
name: loop-debug
description: Use when an AI Loop run, QA gate, alert, heartbeat, connection, approval, or outcome behaves unexpectedly or fails.
---

# Debug a Loop

## Investigate

Reconstruct the pinned version and run timeline from evidence. Identify the first divergent observation, decision, action, result, or heartbeat. Classify side effects as confirmed, absent, or unknown; reconcile unknown effects before retry.

Always investigate before modification. Reproduce with a failing fixture, state one root-cause hypothesis, test it minimally, and preserve audit evidence. Do not change production state while diagnosing.

Produce root cause, impact, duplicate risk, safe recovery, regression test, and proposed canonical change.

## Handoff

Route any fix or recovery mutation to `loop-plan` for approval.

```yaml
handoff:
  loop_id: seo-growth
  completed_skill: loop-debug
  status: completed
  artifacts: [incident-analysis.json, regression-fixture.yaml]
  next_skill: loop-plan
  blocking_requirements: []
```
