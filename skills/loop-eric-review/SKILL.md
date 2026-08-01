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
- QA evidence, shadow/canary rollout, monitoring, ownership, and failure recovery.

Run the readiness command. Scores help compare designs but never override a blocker. Do not accept “self-improving” unless learning changes a versioned policy, prompt, skill, threshold, or action choice after evaluation. Learning may propose changes; consequential modifications still require approval.

## Handoff

Pass routes to `loop-plan`. Revise routes back to `loop-design` with exact defects. Stop has no next skill.

```yaml
handoff:
  loop_id: seo-growth
  completed_skill: loop-eric-review
  status: completed
  artifacts: [eric-review.yaml]
  next_skill: loop-plan
  blocking_requirements: []
```
