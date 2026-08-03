---
name: loop-improve
description: Use when measured AI Loop outcomes reveal a repeatable opportunity to improve quality, speed, cost, leverage, or feedback.
---

# Improve a Loop

## Learn

Compare target/current/gap across enough completed follow-up windows. Link each proposed improvement to evidence, affected decision policy, expected metric change, risk, experiment, rollback, and success threshold.

The loop may propose prompt, skill, threshold, scoring, or action-policy changes. It may not apply them silently. Approval, permissions, stop conditions, external actions, storage, triggers, and other structural rules require a new approved plan. Avoid optimizing proxy output such as article count when the business target is qualified leads.

## Handoff

Send the evidence-backed experiment proposal to `loop-plan`.

```yaml
handoff:
  loop_id: seo-growth
  completed_skill: loop-improve
  status: completed
  artifacts: [improvement-proposal.json]
  next_skill: loop-plan
  blocking_requirements: []
```
