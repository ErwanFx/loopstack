---
name: loop-storage-design
description: Use when an approved AI Loop design needs a visual, durable storage blueprint before connection checks or provisioning.
---

# Design Loop Storage

## Overview

Turn the approved loop design into a **visual storage architecture the owner can understand and approve**, plus a deterministic machine blueprint.

Two mandatory layers:

1. **Visual storage blueprint** — self-contained HTML generated with an installed runtime-native diagram capability or a self-contained HTML/SVG fallback.
2. **Declarative contract** — `storage.yaml` + `storage-blueprint.json`.

This skill **does not** connect, provision, create tables, test-write, or activate anything.

## Hard rules

1. **HTML is the primary owner artifact.** YAML/JSON alone are not design-complete.
2. Detect an installed diagram capability. On Hermes, prefer `architecture-diagram`; otherwise use an equivalent skill or the runtime's normal file/code tools to build `{workspace}/loops/{loop_id}/storage-design-blueprint.html`.
3. Show, visually and in prose:
   - source systems and their source-of-truth roles;
   - data flow into and out of the loop store;
   - provider and physical isolation boundary;
   - logical entity groups and domain projections;
   - append-only and idempotency rules;
   - selected runtime Learn flow (operational evidence → versioned procedure/instruction update and/or durable facts);
   - forbidden data, retention, sensitivity, and least-privilege permissions;
   - lifecycle: design → connection check → approved setup → runtime.
4. **Human visual gate is the exit.** Present the HTML and wait for explicit `APPROVE storage design`, changes, or reject.
5. Do not hand off to `loop-connection-check` until approval.
6. a missing native connection does not block storage design; it is checked later through the agent's native connection capability.
7. Use the smallest durable store that can reconstruct every run and support monitoring. Avoid duplicating source-of-truth systems.
8. Keep provider API calls out of this skill.

## Provider selection

| Provider | Use when |
|---|---|
| **Convex** | production loops, concurrency, durable workflows, future control plane |
| **Airtable** | non-technical operators need direct record visibility |
| **Google Sheets** | low-risk prototype; default one workbook per loop |

Explain the decision in the HTML. Record the physical boundary separately from logical `loopId` isolation.

## Data contract

For Convex/Airtable, include the shared logical entities separated by `loopId`:

- `loops`, `loopVersions`;
- `runs`, `events`, `observations`, `decisions`, `actions`, `actionResults`;
- `approvals`, `evaluations`, `alerts`, `learnings`, `costs`, `heartbeats`, `toolConnections`.
- `workItems`, `stateTransitions`, `externalSubmissions`, `deadlines`, `learningProposals` for durable business cases and governed improvement.

Keep `events`, `decisions`, `stateTransitions`, and `externalSubmissions` append-only. `workItems` hold current state and optimistic revision; their transition history remains separate and immutable. Store business documents in their source system: the loop store keeps only references, hashes, statuses, deadlines, evidence ids, and approval metadata. Add domain projections only when they improve common queries without duplicating another system of truth.

Every run-scoped record should carry `loopId`, `runId`, timestamp and idempotency evidence where applicable. Every durable-case record carries `loopId` and `workItemId`, so Convex and Airtable use shared tables partitioned by `loopId` rather than one table per loop. Google Sheets retains one workbook per loop with the same entity worksheets.

## Workflow

### 1. Load approved design

Require:

- approved `handoff.loop-design.yaml` or approval artifact;
- design `loop.yaml`, `process.yaml`, `tools.yaml`, `skills.yaml`;
- source-of-truth and Learn contracts;
- expected volume, retention, owner and sensitivity if known.

If design is not approved, stop and return to `loop-design`.

### 2. Choose and model

Define:

- provider and rationale;
- physical isolation / container;
- logical isolation;
- canonical entities and domain projections;
- fields, indexes, append-only rules and idempotency;
- data sensitivity, retention and volume;
- required permissions by phase;
- do-not-store list;
- runtime-selected Learn evidence flow following [runtime learning adapters](../../runtime-learning.md).

### 3. Generate deterministic artifacts

Write:

```text
{workspace}/loops/{loop_id}/storage.yaml
{workspace}/loops/{loop_id}/storage-blueprint.json
```

Use Loopstack’s deterministic blueprint generator and validate with `StorageBlueprintSchema` when available. All blueprint operations must have `destructive: false`.

### 4. Generate visual HTML

1. Load an installed diagram capability when available; on Hermes, prefer `architecture-diagram`. Otherwise use the self-contained HTML/SVG fallback.
2. Create one self-contained HTML file:

```text
{workspace}/loops/{loop_id}/storage-design-blueprint.html
```

3. Required sections:
   - architecture SVG (sources → runtime → store → monitor/Learn);
   - provider/isolation decision;
   - entity groups with plain-language purpose;
   - security/retention/permissions;
   - explicit “never stored” data;
   - owner validation table;
   - banner: design only, no connection/provision/write.

Use [example-storage-design-blueprint.html](references/example-storage-design-blueprint.html) as a quality bar, adapting all domain details.

### 5. Present and wait

Deliver the HTML first (`MEDIA:` where available).

| Owner response | Action |
|---|---|
| `APPROVE storage design` | Mark completed and hand off to `loop-connection-check` |
| `CHANGES: …` | Patch HTML + YAML/JSON; re-present |
| Reject | `status: blocked/rework`, `next_skill: null` |

## Handoff

While waiting:

```yaml
handoff:
  loop_id: example
  completed_skill: loop-storage-design
  status: awaiting-approval
  artifacts:
    - storage-design-blueprint.html
    - storage.yaml
    - storage-blueprint.json
  next_skill: null
  blocking_requirements:
    - owner_storage_blueprint_approval
```

Only after approval:

```yaml
handoff:
  loop_id: example
  completed_skill: loop-storage-design
  status: completed
  artifacts:
    - storage-design-blueprint.html
    - storage.yaml
    - storage-blueprint.json
  next_skill: loop-connection-check
  blocking_requirements: []
```

## Common pitfalls

1. YAML/JSON dump without a visual architecture.
2. Creating tables or test-writing during design.
3. Copying CRM/analytics raw data instead of storing references or aggregates.
4. Showing tables without explaining what business question they answer.
5. Hiding the physical isolation boundary.
6. Missing append-only/idempotency rules.
7. Mixing agent/project memory with operational loop-store data.
8. Passing to connection-check before owner approval.
9. Treating “connection missing” as failure of storage design.

## Verification checklist

- [ ] Upstream loop design explicitly approved
- [ ] Provider and physical/logical isolation explained
- [ ] Canonical entities + justified domain projections defined
- [ ] Append-only, idempotency, retention and permissions defined
- [ ] SoT duplication and forbidden data prevented
- [ ] Runtime-selected Learn evidence flow shown
- [ ] `storage-blueprint.json` schema-valid and non-destructive
- [ ] Visual HTML built with an installed diagram capability or documented self-contained HTML/SVG fallback
- [ ] HTML delivered and owner approval awaited
- [ ] No connection/provision/write performed
- [ ] No `loop-connection-check` until explicit approval

## References

- [example-storage-design-blueprint.html](references/example-storage-design-blueprint.html) — real visual storage design quality bar
- [runtime learning adapters](../../runtime-learning.md) — common Learn contract and runtime mappings
- Hermes skill `architecture-diagram` — preferred HTML/SVG generator when installed
