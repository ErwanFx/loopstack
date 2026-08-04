---
name: loop-launch
description: Use when a built AI Loop has passing QA and needs an approval-gated shadow, canary, or active rollout.
---

# Launch a Loop

## Overview

Control deployment and progressive rollout as a distinct external mutation. Build approval never authorizes launch.

## Internal protocol

Load `references/protocols/loop-deploy/SKILL.md` for detailed rollout checks.

## Hard gate

Require:

- fresh machine-readable QA pass;
- matching design, plan hash, build version, and environment;
- readiness `ready` with no hidden blocker;
- verified connections and actual alert placement;
- tested attribution required by the north-star metric;
- owner, kill switch, rollback, and budget;
- when a graph exists, a compiler-valid artifact whose topology hash matches the approved design, build, and QA evidence;
- explicit activation approval for the requested stage.

Do not accept scheduler creation, command success, or a numeric score as proof of external readiness.

Render and review an inert activation plan before mutation. Only this skill may execute its argument-array operations after fresh activation approval; verify the controller entry command, disabled typed triggers, HMAC/idempotency, delivery target, list/test checks, and removal commands first.

## Rollout

```text
shadow → evidence review → canary → evidence review → active
```

Each stage is measurable, time-bounded, reversible, and separately recorded. Start with no consequential external action in shadow. Canary volume and iterations must be explicitly bounded.

Stop or roll back on duplicate risk, stale heartbeat, missing alert, attribution failure, budget breach, policy violation, or unexplained regression.

## Continuous transition

After an approved rollout stage is successfully recorded, invoke `loop-operate` automatically for monitoring. Do not ask a separate transition question.

## Handoff

```yaml
handoff:
  route_version: v2
  loop_id: seo-growth
  completed_skill: loop-launch
  journey: loop-launch
  substage: loop-launch
  status: completed
  artifacts: [deployment-record.json, activation-approval.yaml]
  next_skill: loop-operate
  next_journey: loop-operate
  completed_workers: [loop-launch]
  pending_gate: null
  scope_hash: aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa
  artifact_hashes:
    activation-approval.yaml: dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd
  gate_evidence:
    - gate: activation-approval
      artifact: activation-approval.yaml
      artifact_hash: dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd
      scope_hash: aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa
      approved_by: owner
      approved_at: 2026-08-03T20:00:00Z
      expires_at: 2099-08-03T21:00:00Z
  activation_allowed: true
  blocking_requirements: []
```
