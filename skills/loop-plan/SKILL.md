---
name: loop-plan
description: Use when a reviewed AI Loop design is ready for a versioned implementation plan and explicit authorization boundary.
---

# Plan a Loop

## Overview

Translate the approved design into an executable, test-driven implementation plan. Approval applies only to the listed mutations, environment, and version.

## Required Plan

Specify:

1. classification, evidence, target, current state, gap, and readiness report;
2. architecture, Hermes runtime profile, Claude Code packaging, and repository paths;
3. exact files, skills, scripts, schemas, tests, and versions to create or change;
4. selected Convex, Airtable, or Google Sheets adapter, connection checks, schema, migrations, and cleanup;
5. tools, secrets, least-privilege permissions, triggers, schedules, webhooks, and delivery channels;
6. runtime human approvals and the separate implementation approval boundary;
7. unit, contract, simulation, fixture, failure, alert, shadow, canary, rollback, and end-to-end tests;
8. monitoring, alerting, escalation, ownership, cost limits, and recovery;
9. exact permitted external mutations, environment, rollback, and explicitly out-of-scope actions.

Break implementation into small TDD tasks with file paths, commands, expected failures, success evidence, and commits. If a required connection is missing, make connection setup a blocker or an explicitly approved task.

## Approval Stop

Present the complete plan and request explicit approval. Do not implement, connect accounts, create tables, schedule triggers, publish content, or mutate external systems before approval. Any material scope change requires a new plan version and new approval.

## Handoff

While waiting, emit `awaiting-approval` with no next skill. Only after explicit approval emit a completed handoff to `loop-implement`.

```yaml
handoff:
  loop_id: seo-growth
  completed_skill: loop-plan
  status: awaiting-approval
  artifacts: [implementation-plan.md]
  next_skill: null
  blocking_requirements: [explicit implementation approval]
```
