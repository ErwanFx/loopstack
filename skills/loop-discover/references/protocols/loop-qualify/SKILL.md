---
name: loop-qualify
description: Use when discovery evidence exists and a business process must be classified before designing an automation or AI system.
---

# Qualify a Loop

## Overview

`loop-qualify` answers **two separate questions**. Do not merge them in the user-facing conclusion.

| # | Question | Outcome |
|---|---|---|
| **1. Classification** | What kind of system is this? | Exactly one type (see below) |
| **2. Readiness** | If it is an AI Loop, what still blocks **activation** later? | `ready` or `blocked` + exact checklist |

**Critical rule — read this first:**

- Classification = AI Loop → **always allow the next skill `loop-design`**.
- Readiness blockers **do not block design**.
- Readiness blockers **only block activation** (deployable triggers, external writes, go-live).
- Say this explicitly to the user every time readiness is `blocked`.

Bad (confusing): “Blocked — we cannot continue.”  
Good: “**Qualified as AI Loop.** Readiness blocked for **activation** (list). **Next step = `loop-design` anyway.** Blockers stay on the checklist until deploy.”

## When to Use

- `loop-idea` finished with `next_skill: loop-qualify` and a `discovery.yaml` (or equivalent evidence).
- Someone asks “is this an AI loop?” after discovery.

**Don’t use for:** discovery interview (`loop-idea`), full design (`loop-design`), or clearing infra blockers (do that as normal work, then re-run readiness).

## Step 1 — Classify (required)

Choose **exactly one** and give evidence:

1. **AI Loop** — recurring bounded work + measurable feedback + executable control from durable state. The operating path may prompt an agent repeatedly, or be deterministic when an AI evaluator/improver closes the learning cycle.
2. **AI-assisted workflow** — humans drive; AI helps steps without a closed optimising cycle
3. **deterministic automation** — rules fully determine the output (prefer this when true)
4. **on-demand agent task** — each run starts from a human request; no durable cadence/state needed
5. **monitoring or reporting system** — observe/alert only; no action closes the feedback cycle
6. **human SOP or approval process** — people execute; docs/checklists suffice
7. **data pipeline** — move/transform data; not an optimising decision loop
8. **one-time project** — finite deliverable, not an operating loop
9. **multiple independent loops requiring decomposition** — different owners, horizons, or objectives → decompose

### Preference order (simpler wins)

- Prefer **deterministic automation** when rules fully determine the output.
- Prefer **on-demand agent task** when a human request starts each isolated job.
- Prefer **monitoring** when nothing acts on feedback.
- Decompose when owners / feedback horizons / objectives diverge.

### AI Loop test (all should hold)

| Present? | Signal |
|---|---|
| Recurring unit of work | cadence or continuous stream |
| Decision / judgment | not only mechanical transform |
| Bounded action space | allowed / forbidden actions named |
| Measurable feedback | metric + source + delay |
| Iteration | results change future runs |
| AI control | a bounded maker/checker prompt cycle, or an AI feedback/improvement node governing a deterministic operating path |

A cron, webhook, state machine, or dashboard alone is not an AI Loop. The initiating trigger may be a cron, webhook, event, queue, or human request; what qualifies the system is the repeated agent prompt cycle and measurable feedback, not the trigger type.

### Execution mode (required)

Choose the simplest mode that fits:

1. `deterministic-with-ai-improvement` — business execution is code/rules; a model-backed AI evaluator creates governed improvement proposals, with no autonomous agent profile required.
2. `single-agent-multi-session` — default when judgment is needed; one reusable agent profile performs different bounded nodes in fresh sessions.
3. `multi-agent` — only for real isolation, different permissions/models, independent ownership, or safe parallel work. Different tasks alone do not justify different agents.

Then record **graph necessity** separately. Use no prompt graph for a linear, easily observable sequence. Recommend an optional graph only for explicit dependencies, conditional routing, joins, bounded cycles, parallel fan-out, human waits, or resumable recovery. The product remains an AI Loop either way.

For an AI Loop, also select exactly one architecture shape:

- `control-loop` for one recurring unit without a long-lived case;
- `workflow-with-control-loop` for durable work items, waits, gates, and an embedded agent control loop;
- `multi-loop-system` only when independent loops have separate owners, targets, or feedback horizons.

If classification is **not** AI Loop: stop after recommending the pattern. **Do not** run readiness as a fake AI Loop gate. `next_skill: null`.

## Step 2 — Readiness (only if classification = AI Loop)

Map discovery evidence into a readiness candidate and run:

```bash
# from loopstack repo root
pnpm loopstack readiness path/to/candidate.readiness.yaml
# or:
./node_modules/.bin/tsx src/cli.ts readiness path/to/candidate.readiness.yaml
```

Record the full CLI report: `status`, `score`, `blocking[]`, `advisory[]`.

### What readiness means

| Readiness | Means | May do | Must not do |
|---|---|---|---|
| **ready** | Activation requirements satisfied on paper | Design → plan → implement → deploy path | Skip human gates defined in discovery |
| **blocked** | Missing storage, data access, tools, alerts, etc. | **`loop-design` (draft OK)**; clear blockers in parallel | Deployable triggers, external write perms, activation |

**Blockers are a carry-forward checklist**, not a red light on the skill pipeline.

Persist them in:

- `qualification.yaml` (exact need-to-clear text)
- handoff `blocking_requirements` (short list)
- re-check at **activation** (`loop-deploy` / readiness re-run)

An **advisory** score never overrides a hard blocking code.  
A **blocking** code never overrides “you may design.”

## User-facing summary (mandatory shape)

Always lead with classification, then readiness, then next step:

```text
1) Classification: AI Loop (or other) — why in 3 bullets
2) Readiness: ready | blocked — score, blocking codes
3) Next skill: loop-design   ← if AI Loop, EVEN WHEN readiness blocked
4) Activation checklist: blockers to clear before go-live (or empty)
```

Never imply that a blocked readiness fails qualification as an AI Loop.

## Artifacts

Write under the loop workspace (e.g. `$HERMES_HOME/home/loops/{loop_id}/`):

| File | Content |
|---|---|
| `candidate.readiness.yaml` | Input mapped for the CLI (AI Loop only) |
| `qualification.yaml` | Classification + evidence + readiness report + activation checklist |
| `handoff.loop-qualify.yaml` | Machine handoff |

`loop_id`: keep the discovery id; do not paste skill examples (`seo-growth`).

## Handoff

### A) AI Loop + readiness ready → design

```yaml
handoff:
  loop_id: ecoi-seo-content
  completed_skill: loop-qualify
  status: completed
  artifacts: [qualification.yaml, candidate.readiness.yaml]
  next_skill: loop-design
  blocking_requirements: []
```

### B) AI Loop + readiness blocked → design anyway

```yaml
handoff:
  loop_id: ecoi-seo-content
  completed_skill: loop-qualify
  status: completed
  artifacts: [qualification.yaml, candidate.readiness.yaml]
  next_skill: loop-design
  blocking_requirements:
    - data_access: …
    - connected_storage: …
  # NOTE: blocking_requirements = activation checklist only.
  # next_skill stays loop-design. Do not set status blocked for this case.
```

### C) Not an AI Loop → stop

```yaml
handoff:
  loop_id: ecoi-seo-content
  completed_skill: loop-qualify
  status: completed
  artifacts: [qualification.yaml]
  next_skill: null
  blocking_requirements: []
  # qualification.yaml must name the chosen pattern and why
```

### Status field rules

| Situation | `status` | `next_skill` |
|---|---|---|
| AI Loop (ready or blocked readiness) | `completed` | `loop-design` |
| Not an AI Loop | `completed` | `null` |
| Cannot classify (evidence missing) | `blocked` | `null` — return to discovery questions |

Use handoff `status: blocked` **only** when qualification itself cannot finish (missing discovery evidence).  
**Do not** use `status: blocked` merely because readiness CLI returned blockers.

## Common pitfalls

1. **Telling the user “we’re blocked” when only readiness is blocked** — they hear “stop”; say “qualified; design next; activate later.”
2. **Setting `next_skill: null` because readiness failed** — wrong; design proceeds.
3. **Setting handoff `status: blocked` for readiness blockers** — reserve `blocked` for “cannot classify.”
4. **Skipping classification and only running readiness** — readiness without type is meaningless.
5. **Forcing AI Loop** when deterministic automation or on-demand task fits better.
6. **Copy-pasting example `loop_id: seo-growth`.**
7. **Clearing blockers silently in prose** without writing them into `qualification.yaml`.
8. **Treating advisory score as a hard gate.**
9. **Starting implementation/deploy inside this skill.**

## Verification checklist

- [ ] Exactly one classification with evidence
- [ ] If not AI Loop: recommended pattern + `next_skill: null`
- [ ] If AI Loop: readiness CLI run recorded (or explicit why CLI unavailable)
- [ ] User summary used the 4-line shape (class → readiness → next → activation checklist)
- [ ] AI Loop ⇒ `next_skill: loop-design` regardless of readiness blockers
- [ ] Readiness blockers listed as **activation** checklist, not as “cannot design”
- [ ] Artifacts written on disk
- [ ] No deployable trigger / external write / activation performed
