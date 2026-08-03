---
name: loop-eric-review
description: Use when an AI Loop design needs a critical leverage, feedback, safety, and operability review before implementation planning.
---

# Eric Siu Loop Review

## Overview

Challenge whether the design is truly a compounding feedback system instead of a scheduled prompt or brittle workflow. Read [the review checklist](references/eric-siu-checklist.md).

## Review

Lead with a verdict: pass, revise, or stop. Then review:

- target / current / gap and whether the agent can observe each one;
- state, evidence, scoring, decisions, bounded actions, and recorded results;
- feedback timing, outcome measurement, attribution, and follow-up jobs;
- what the loop learns and how changes are proposed, tested, versioned, and rolled back;
- high-leverage bottleneck, volume, cost, speed, quality, and compounding advantage;
- human gates, confidence thresholds, budgets, iteration caps, stop, and escalation;
- tool, storage, alert, and runtime connections with least privilege;
- declarative-versus-live drift: inspect actual scheduler/cron inventory, enabled state, last statuses, target environment, and delivery placement rather than trusting YAML alone;
- QA evidence, shadow/canary rollout, monitoring, ownership, and failure recovery.

Run the readiness command against **current artifacts**, first reconciling stale statuses from completed storage/tool work. Scores help compare designs but never override a blocker. For alert readiness, verify actual destination placement; scheduler acceptance alone does not count. Do not accept “self-improving” unless learning changes a versioned policy, prompt, skill, threshold, or action choice after evaluation. Learning may propose changes; consequential modifications still require approval.

## Handoff

Pass routes to `loop-plan`. Revise routes back to `loop-design` with exact defects while naming the already-approved components that must be preserved; do not trigger a wholesale redesign. Stop has no next skill. In the user-facing conclusion, explicitly present and propose the routed next skill per `using-loopstack`.

```yaml
handoff:
  loop_id: seo-growth
  completed_skill: loop-eric-review
  status: completed
  artifacts: [eric-review.yaml]
  next_skill: loop-plan
  blocking_requirements: []
```
