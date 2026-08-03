---
name: loop-deploy
description: Use when an AI Loop has a passing QA verdict and an approved activation plan for a specific runtime and environment.
---

# Deploy a Loop

## Gate

Require a machine-readable `pass verdict`, matching version and plan hash, verified connections, tested alerts, rollback instructions, owner, and kill switch. Activation is a separate external mutation and must be approved.

## Rollout

Begin with `shadow`: observe and decide, but simulate every consequential action. Review evidence before moving to approval-only drafts, then canary volume, then active. Keep each stage measurable, time-bounded, reversible, and pinned to one loop version.

Stop or roll back on a blocker, duplicate risk, untested alert, budget breach, stale heartbeat, or unexplained metric regression. Record every activation transition.

## Handoff

After shadow activation, hand off to `loop-monitor`. A failed rollout routes to `loop-debug` through the monitor incident flow.

```yaml
handoff:
  loop_id: seo-growth
  completed_skill: loop-deploy
  status: completed
  artifacts: [deployment-record.json]
  next_skill: loop-monitor
  blocking_requirements: []
```
