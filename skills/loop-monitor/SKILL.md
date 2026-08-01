---
name: loop-monitor
description: Use when a shadow, canary, active, paused, degraded, or failed AI Loop needs health, outcome, cost, approval, or incident review.
---

# Monitor a Loop

## Observe

Read canonical registry data and native operational memory. Report lifecycle status, pinned version, runtime, storage, heartbeat, last run, target/current/gap, costs, pending approvals, open alerts, follow-up measurements, and recent learnings.

Detect stale runs independently of terminal agent output. For every incident, record failed step, completed actions, duplicate-action risk, retry history, owner, recommended action, and exact resume command.

## Decide

Route a healthy measurable optimization opportunity to `loop-improve`; a requested process or approval change to `loop-modify`; and failures, ambiguity, or regressions to `loop-debug`. Never alter the loop while monitoring.

## Handoff

Emit one of the permitted next skills with evidence.

```yaml
handoff:
  loop_id: seo-growth
  completed_skill: loop-monitor
  status: completed
  artifacts: [health-report.json]
  next_skill: loop-improve
  blocking_requirements: []
```
