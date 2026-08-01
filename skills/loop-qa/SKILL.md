---
name: loop-qa
description: Use when an implemented or materially modified AI Loop must be validated before any activation or deployment change.
---

# Test a Loop

## Run QA

Run gates in order: static manifests, native connections, storage contract, scenarios, approvals, idempotency, alerts, and shadow/canary simulation. Inject missing data, low confidence, rejected approval, duplicate trigger, timeout, budget exhaustion, and interruption.

Stop before side effects when a mandatory gate fails. Treat ambiguous tool outcomes as `unknown`, prohibit automatic retry, and require reconciliation.

Do not claim success without a machine-readable QA report containing every gate, finding, evidence reference, blocker, and activation verdict. A score cannot override a blocker.

## Handoff

A `pass` report proceeds to `loop-deploy`. A blocked report proceeds to `loop-debug` or stops for missing external evidence.

```yaml
handoff:
  loop_id: seo-growth
  completed_skill: loop-qa
  status: completed
  artifacts: [qa-report.json, qa-report.md]
  next_skill: loop-deploy
  blocking_requirements: []
```
