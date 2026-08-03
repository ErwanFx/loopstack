---
name: loop-idea
description: Use when a recurring business process, automation idea, or operational problem is still vague and needs evidence-led discovery before solution selection.
---

# Loop Idea

## Overview

Run a rigorous, conversational discovery interview before deciding that AI or a loop is appropriate. Produce durable evidence (`discovery.yaml`), not vibes. Prefer the narrowest valuable starting point over a grand redesign.

This skill is **domain-agnostic**. SEO, sales, ops, support, finance — same discipline.

## When to Use

- Someone wants to “automate”, “make autonomous”, or “turn into an AI loop” a process that is still fuzzy.
- A process exists as tribal knowledge / SOP / agent skill but has no measurable closed loop.
- Stakeholders disagree on success metrics, owners, or what must stay human.

**Don’t use for:** classification (`loop-qualify`), design (`loop-design`), implementation, or “just build it”. Discovery only.

## Hard Rules

1. **One question at a time.** Adapt to the answer; never dump a questionnaire.
2. **Tools before beliefs.** When systems are named (CRM, analytics, Search Console, DB, sheets), **verify access and pull a real baseline sample in-session** instead of accepting “I think it’s connected”.
3. **No invented precision.** Missing baseline → record blocker or `baseline: unknown` with how it will be established — never fake a number.
4. **Separate lagging business outcomes from leading / ops metrics.** “More revenue / more leads / better SEO” is not a KPI until defined, sourced, and baselined.
5. **Map progressive autonomy explicitly.** “Fully autonomous later” is a trajectory with gate-removal criteria, not a v1 design assumption.
6. **Name the bottleneck observed in the last real run**, not the bottleneck assumed from the org chart.
7. **Measurement topology early:** source of truth per metric, report cadences, and whether a **small independent loop store** is needed for pipeline state / snapshots / gate events (without duplicating system-of-record business data).
8. **At least two alternatives**, including a **non-loop** option, before recommending a direction.
9. **No deployable loop, trigger, write permission, or implementation plan** during discovery.
10. **Answer in the user’s language.** Keep artifacts in clear structured YAML.

## Interview

1. Read [the interview rubric](references/interview-rubric.md) before starting.
2. Read [the discovery template](references/discovery.template.yaml) so you know the artifact shape you must fill.
3. Establish business context, desired change, and why this matters **now**.
4. Ask one question at a time; follow the rubric order loosely, not as a script.
5. When outcomes are vague, force: **definition → source of truth → current baseline → horizon → success minimum vs stretch**.
6. When systems appear, **verify**:
   - Can this agent read them right now?
   - What does a sample show (even N=0 is evidence)?
   - What is missing (auth, UTM path, field, property link)?
7. Identify owner, users, inputs, outputs, systems, permissions, risks, costs, feedback delay, and **human gates that must remain in v1**.
8. Surface the **actual failure mode** of the last cycle (quality, latency, handoff, data, approvals…).
9. Propose measurement cadences (ops pulse / strategy / verdict horizon) sized to feedback delay.
10. Present ≥2 alternatives + non-loop option; recommend a **narrow wedge**.
11. Write `discovery.yaml` + handoff under a stable loop workspace path.

### Good probe patterns (pick one, then stop)

- “What changes in 90 days if this works — in a number we can read from a system?”
- “What is one unit of work, who starts it, who ends it?”
- “Show me the last real example — artifact, ticket, URL, row.”
- “What must stay human even if everything else is automated?”
- “Where did the last run actually burn time?”
- “If we only built measurement + reporting first, would that already help?”

## Access & baseline checks

Treat “we have X” as a hypothesis until checked.

| Claim | Minimum proof in-session |
|---|---|
| Analytics / Search property connected | Successful API/MCP query returning rows or explicit `not_connected` |
| CRM / leads DB available | Authenticated list/count sample; note filters for the north-star definition |
| Attribution (UTM, source fields) | Sample distribution; flag if north-star filter matches **zero** rows |
| Agent credentials | Which profile/env can read what; gaps listed as blockers for later skills |

If proof fails, **pause or block** with exact reconnect steps rather than continuing on fiction.

## Measurement topology (generic)

Always distinguish:

1. **System of record (SoT)** for the business outcome (CRM, billing, tickets…).
2. **Leading signal systems** (analytics, queue depth, quality scores…).
3. **Loop store** (optional but common): independent small DB/project for:
   - work-item / pipeline state,
   periodic **snapshots** (so trends survive API volatility),
   **gate events** (approve / reject / rework reasons).

Do **not** duplicate the SoT into the loop store. Snapshots and state only.

Default reporting layers (adapt names, keep the idea):

- **Ops pulse** (e.g. weekly): throughput, blockers, leading signals, gate outcomes.
- **Strategy** (e.g. monthly): trends vs target, keep/improve/kill decisions.
- **Verdict horizon** (aligned to feedback delay, often 30–90 days): lagging business outcome + autonomy trajectory.

## Exit criteria

End with **exactly one** outcome:

| Outcome | When | `next_skill` |
|---|---|---|
| **Continue** | Enough evidence to classify in `loop-qualify`; discovery artifact written | `loop-qualify` |
| **Block** | Critical evidence missing (no owner, no observable outcome path, no access to claimed systems, etc.) | `null` — list missing proof + next question |
| **Reframe / abandon** | A loop would not solve the real problem; point to SOP, one-off project, pure monitoring, or deterministic automation | `null` |

Continue does **not** mean “ready to deploy”. It means “ready to qualify”.

## Artifact

Write:

```text
{workspace}/loops/{loop_id}/discovery.yaml
{workspace}/loops/{loop_id}/handoff.loop-idea.yaml
```

Use [discovery.template.yaml](references/discovery.template.yaml). Prefer a dedicated loops workspace (Hermes: under `$HERMES_HOME/home/loops/` unless the repo already defines another registry path).

`loop_id`: kebab-case, stable, **not** copied from skill examples. Derive from domain + outcome (e.g. `ecoi-seo-content`, `billing-dunning`, `support-triage`).

## Handoff

On Continue only:

```yaml
handoff:
  loop_id: ecoi-seo-content
  completed_skill: loop-idea
  status: completed
  artifacts: [discovery.yaml]
  next_skill: loop-qualify
  blocking_requirements: []
```

On Block / Reframe:

```yaml
handoff:
  loop_id: pending-or-known
  completed_skill: loop-idea
  status: blocked   # or completed with next_skill null for abandon/reframe
  artifacts: [discovery.yaml]
  next_skill: null
  blocking_requirements:
    - exact missing evidence or reason for abandon
```

Validate handoff shape against the repo handoff schema when available.

## Common pitfalls

1. **Accepting vanity goals** — “better SEO / more sales / save time” without definition + SoT + baseline.
2. **Skipping live access checks** — discovery that trusts dashboard folklore.
3. **Collapsing leading and lagging metrics** — optimizing weekly vanity while the business outcome moves on a 90-day delay.
4. **Designing full autonomy in v1** — ignore progressive gates and removal criteria.
5. **Missing the real bottleneck** — automating copy while humans drown in visual/compliance/approval friction.
6. **Questionnaire mode** — multiple questions per turn; user disengages; evidence stays shallow.
7. **Jumping to implementation** — crons, schemas, prompts, write access during idea stage.
8. **Example `loop_id` leakage** — shipping `seo-growth` from the template into unrelated domains.
9. **No non-loop alternative** — everything becomes a loop by default.
10. **Duplicate SoT data lakes** — cloning CRM into a “SEO DB” instead of snapshots + pipeline state.
11. **Finishing without `discovery.yaml`** — conversation-only discovery cannot hand off cleanly.
12. **False baseline precision** — inventing “~5 leads/month” when the sample shows unknown or zero.

## Verification checklist

- [ ] Rubric areas covered or explicitly marked unknown/blocked
- [ ] North-star metric has definition + SoT + baseline attempt (incl. verified 0)
- [ ] Named systems were access-checked with tool evidence when possible
- [ ] Human gates v1 listed; autonomy trajectory separate from v1
- [ ] Bottleneck from a real recent example recorded
- [ ] Measurement cadences + loop-store need (yes/no + why) recorded
- [ ] ≥2 alternatives including non-loop option
- [ ] Exactly one exit outcome
- [ ] `discovery.yaml` + handoff written on disk
- [ ] No deployable trigger/write/implement artifacts created
