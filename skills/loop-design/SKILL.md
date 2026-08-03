---
name: loop-design
description: Use when a process has qualified as an AI Loop and needs a complete, measurable, portable design before implementation planning.
---

# Design a Loop

## Overview

Turn a qualified AI Loop into a **reviewable blueprint** the owner can approve or reject **before** any storage build or activation.

Two deliverable layers:

1. **Visual blueprint (mandatory, primary for human validation)** — one self-contained HTML file built with the Hermes skill **`architecture-diagram`** (dark SVG + structured sections).
2. **Declarative package (mandatory, machine handoff)** — `loop.yaml` + supporting YAML under the loop workspace.

**Do not activate** crons, external writes, or deployable config in this skill.

## When to Use

- `loop-qualify` handed off with classification **AI Loop** and `next_skill: loop-design`.
- Owner asks to “see the loop” / validate design before storage or build.

**Don’t use for:** discovery, classification-only, storage provisioning, implementation, or go-live.

## Hard rules

1. **Human visual gate is the design exit.** The owner must see the HTML blueprint and answer **yes/no** (or request changes). Do **not** treat YAML-only output as design-complete.
2. **Structure the design and the HTML around this cycle (exact order):**
   1. **Target** — what good looks like  
   2. **Observe** — reality sources (metrics, CRM, SERP, analytics, tests, support…)  
   3. **Evaluate** — rubric, metric, judge, or deterministic check  
   4. **Act** — bounded actions (edit, research, draft, test, route, notify…)  
   5. **Learn** — state, traces, score history, reusable patterns  
   6. **Decide** — continue, stop, change strategy, or escalate  
3. **Show gates, stop, escalate, and traces explicitly** on the diagram and in prose — not only happy path.
4. **Generate the HTML with skill `architecture-diagram`.** Load it via `skill_view(name='architecture-diagram')` and follow its dark theme / SVG conventions. Reference example: [example-ai-loop-blueprint.html](references/example-ai-loop-blueprint.html).
5. **Still emit the YAML package** for later skills (`loop-storage-design`, plan, implement). YAML alone is insufficient for owner approval.
6. **No activation.** Triggers may be specified with `enabled: false`. Record activation blockers as checklist only — they do **not** block producing or approving a design draft.
7. **Domain-agnostic.** SEO is only an example in references; any process uses the same six-box cycle.
8. **Answer in the user’s language.** Keep artifact filenames stable English/kebab-case.

## Workflow

### 1. Load inputs

- `discovery.yaml`, `qualification.yaml`, readiness candidate/report if present.
- Carry forward: north-star metric, baseline, gates v1, forbidden actions, systems, activation blockers.

### 2. Draft the control cycle (six boxes)

Fill each box with **concrete** content for *this* loop (not generic verbs only):

| Box | Must answer |
|---|---|
| **Target** | Metric definition, SoT, baseline, desired, horizon, ops “good week”, leading vs lagging |
| **Observe** | Every system/signal read each run or each cadence + current access status |
| **Evaluate** | Gap formula, rubrics/checklists, who judges (agent / human / deterministic) |
| **Act** | Allowed actions, forbidden actions, unit of work, cadence, handoff to human gates |
| **Learn** | What is written where (state tables, gate events, snapshots), how patterns become skill/process patches |
| **Decide** | Continue / stop / change strategy / escalate — with triggers for each |

Also define:

- human gates (when, artifact, timeout, fallback);
- run success vs business success;
- budget, idempotency, retries, rollback;
- runtime (Hermes primary) and storage *intent* only;
- tools + least privilege.

### 3. Produce the HTML blueprint (mandatory)

1. `skill_view(name='architecture-diagram')` (and template if needed).
2. Write a **single self-contained `.html`** file, e.g.:

```text
{workspace}/loops/{loop_id}/design/ai-loop-blueprint.html
```

3. HTML **must** include:
   - header: loop id, name, draft/not activated;
   - **SVG diagram** of the six stages as a closed loop (arrows), plus human-gates strip and loop-store/memory if any;
   - sections **1–6** matching Target → … → Decide with real content for this loop;
   - a **Skills runtime** section (mandatory): always-on vs on-demand skills used *inside* operating runs — **not** loopstack lifecycle skills (`loop-idea`, `loop-design`, …). Include a phase→skills matrix (research / draft / GEO / QA / integrate / measure). Prefer carrying forward any skill map drafted in `loop-idea` discovery;
   - a “week type” or “run type” table (concrete timeline);
   - activation checklist (if readiness blocked) clearly labelled *does not block design approval*.

4. Deliver the file to the user for review (`MEDIA:` on Slack/Telegram when available, or path).

Use [example-ai-loop-blueprint.html](references/example-ai-loop-blueprint.html) as the quality bar (structure + density + visual loop). Adapt domain content; do not ship the SEO example unchanged for unrelated loops.

### 4. Produce the declarative package

Under `{workspace}/loops/{loop_id}/design/`:

| File | Role |
|---|---|
| `ai-loop-blueprint.html` | **Owner validation artifact** |
| `loop.yaml` | id, name, version, status=`designing`, target, current, triggers, feedback, approval |
| `process.yaml` | six-box cycle detail + rhythms + states |
| `skills.yaml` | **Runtime** skills only: always_on, on_demand, phase matrix, minimum viable pack (not loopstack lifecycle) |
| `tools.yaml` | tools, modes, connection status |
| `storage.yaml` | provider intent only (no provision) |
| `approvals.yaml` | gates, timeouts, progressive autonomy |
| `alerts.yaml` | channels, codes, report minimum |
| `evaluations.yaml` | business metric, follow-ups, proxies, learning policy |
| `tests.yaml` | scenarios, no external mutations |
| `controls.yaml` | budget, stop, escalate, rollback, policy |
| `README.yaml` | package index + next skill |

Validate `loop.yaml` against LoopDefinition schema when the loopstack CLI is available.

### 5. Present and wait for owner validation

User-facing summary must be short and point at the **HTML first**.

**Stop after presentation** until the owner replies with one of:

| Reply | Action |
|---|---|
| Approve / `APPROVE design` | Write handoff → `loop-storage-design` |
| Changes / `CHANGES: …` | Patch HTML + YAML, re-present (no skip-ahead) |
| Reject | Status blocked/rework; `next_skill: null` until redesigned |

**Do not** start `loop-storage-design` without explicit approval of the blueprint.

## Handoff

Only after owner approval:

```yaml
handoff:
  loop_id: ecoi-seo-content
  completed_skill: loop-design
  status: completed
  artifacts:
    - design/ai-loop-blueprint.html
    - design/loop.yaml
    - design/process.yaml
    - design/approvals.yaml
    - design/tests.yaml
  next_skill: loop-storage-design
  blocking_requirements:
    - activation:…   # checklist only; design already approved
```

If waiting on review:

```yaml
handoff:
  loop_id: …
  completed_skill: loop-design
  status: awaiting-approval
  artifacts: [design/ai-loop-blueprint.html, design/loop.yaml, …]
  next_skill: null
  blocking_requirements:
    - owner_blueprint_approval
```

## Common pitfalls

1. **YAML dump without HTML diagram** — owner cannot “see” the loop; fails this skill’s bar.
2. **Pretty diagram with empty boxes** — each stage needs *this* loop’s metrics/actions/stops.
3. **Skipping owner approval** and jumping to storage/implement.
4. **Activating crons or writes** during design.
5. **Hiding human gates** or implying full autonomy in v1 without removal criteria.
6. **No Learn/trace story** — if it is not recorded, it will not improve.
7. **Mixing lagging business metrics with weekly vanity** without labelling.
8. **Copy-pasting example SEO HTML** for a non-SEO domain.
9. **Treating activation readiness blockers as “cannot design.”**
10. **Building HTML without loading `architecture-diagram`** (wrong visual system / one-off styles that drift).
11. **Omitting the Skills runtime section** or listing only `loop-*` lifecycle skills instead of operating skills (copy, GEO, research, domain playbook).
12. **Inventing skill names** not installed / not planned — map must match hub installs or explicit “to install”.

## Verification checklist

- [ ] Six stages Target→Observe→Evaluate→Act→Learn→Decide fully specified
- [ ] HTML blueprint generated via **`architecture-diagram`** conventions
- [ ] SVG shows closed loop + gates + memory/store
- [ ] HTML sections mirror the six stages with concrete content
- [ ] HTML includes **Skills runtime** (always-on / on-demand / phase matrix); `skills.yaml` matches
- [ ] Declarative YAML package written; `loop.yaml` schema-valid when CLI available
- [ ] Triggers default disabled / non-activating
- [ ] Activation blockers listed as checklist only
- [ ] Blueprint delivered to owner and **approval awaited**
- [ ] No `loop-storage-design` until explicit approve
- [ ] Example reference consulted for quality bar

## References

- [example-ai-loop-blueprint.html](references/example-ai-loop-blueprint.html) — real ECOI SEO design output (quality bar + structure)
- Hermes skill **`architecture-diagram`** — required generator for the HTML/SVG blueprint
