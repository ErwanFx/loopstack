# Interview rubric

Collect evidence in this order while keeping the conversation natural.
One question at a time. Skip ahead only when the user already supplied solid evidence.

| Area | Evidence required | Probe intent |
|---|---|---|
| Problem | Specific recurring event, frequency, volume, cost of inaction | Why now? What breaks if we do nothing for 90 days? |
| Present | Current workaround, owner, participants, systems, observed bottleneck | Who does what today? Where does time actually burn? |
| Reality | One recent example + direct observation or raw artifact when possible | Show the last ticket/URL/row/run — not a hypothetical. |
| Outcome | Measurable target, **definition**, source of truth, baseline, horizon, minimum vs stretch | What number in which system moves? |
| Decisions | State inspected, evidence used, judgment made, bounded actions available | What does the “agent/system” decide vs merely execute? |
| Feedback | Signal, source, delay, attribution quality, learning opportunity | How fast do we learn? Can we attribute cause → effect? |
| Controls | Approval points, forbidden actions, budget, stop, escalation, rollback | What stays human in v1? What never goes autonomous? |
| Measurement | Cadences (ops / strategy / verdict), leading vs lagging, loop-store need | How do we review weekly vs judge at horizon? |
| Access | Verified read path for each SoT/leading system; sample pulled in-session | “Connected” is not proof — query it. |
| Fit | Narrowest wedge, ≥2 alternatives incl. non-loop, reversibility, leverage | Smallest loop that could work? |
| Runtime skills | Always-on + on-demand skills for operating runs (copy, GEO/AEO, research, QA…) — not lifecycle `loop-*` | What must the agent load each cycle? What is missing to install? |

## Anti-patterns (reject or reframe)

- “Save time”, “improve SEO”, “automate sales”, “be more autonomous” without baseline, owner, and observable outcome.
- Targets without a **readable system** (“we’ll feel it”).
- Autonomy as an on/off switch with no gate-removal criteria.
- Metrics that the agent cannot query (or humans will not open) on the stated cadence.
- Invented baselines when access failed or sample is empty — record `unknown` or `0` with method.

## Baseline rules

| Situation | Record as |
|---|---|
| Access OK, filter matches nothing | `0` (real baseline) + keep the query definition |
| Access OK, metric undefined | blocker: define metric before numbering |
| Access failed | blocker: restore access; do not estimate |
| User estimate only | `estimated` with low confidence — plan a measured baseline job |

## Progressive autonomy

Capture three layers separately:

1. **v1 human gates** (must approve now)
2. **Autonomous between gates** (agent may run)
3. **Removal criteria** (what measured signal allows dropping a gate later)

Never treat “eventually fully autonomous” as permission to skip v1 gates in discovery.
