---
name: loop-storage-design
description: Use when a designed AI Loop needs durable operational memory and a choice between Convex, Airtable, or Google Sheets.
---

# Design Loop Storage

## Overview

Choose the smallest durable store that can reconstruct every run and support future monitoring. Loopstack defines the contract; the agent's native connection performs later setup.

## Choose

Use Convex for production loops, concurrency, durable workflows, or a future control plane. Use Airtable when non-technical operators need direct visibility. Use Google Sheets for low-risk prototypes; default to one workbook per loop.

Use shared logical entities for Convex and Airtable, separated by `loopId`. Include loops, versions, runs, events, observations, decisions, actions, results, approvals, evaluations, alerts, learnings, costs, heartbeats, and tool connections. Keep events and decisions append-only.

Generate the deterministic blueprint. State the provider, isolation boundary, data sensitivity, retention, volume, owner, and required permissions. Do not connect, provision, or test-write here.

## Handoff

Send `storage.yaml` and its blueprint to `loop-connection-check`.

```yaml
handoff:
  loop_id: seo-growth
  completed_skill: loop-storage-design
  status: completed
  artifacts: [storage.yaml, storage-blueprint.json]
  next_skill: loop-connection-check
  blocking_requirements: []
```
