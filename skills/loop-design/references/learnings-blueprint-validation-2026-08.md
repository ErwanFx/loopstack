# Learnings applied to loop-design (2026-08)

## From ecoi-seo-content live run

### Owner preference (Erwan)
- Primary validation artifact = **visual AI-loop blueprint HTML**, not YAML tables alone.
- Must present the loop as: **Target → Observe → Evaluate → Act → Learn → Decide**.
- Owner reviews the diagram/HTML and says **yes/no** (or requests changes) before next skill.
- Need to see gates, stop, escalate, traces, and a concrete “week type” run.

### What worked
- Dark HTML+SVG via **architecture-diagram** conventions (grid, stage colors, closed loop arrows).
- Human gates strip under the cycle.
- Loop store as memory node feeding Learn → future Observe/Evaluate.
- Explicit activation checklist separated from design approval.
- Delivering file with MEDIA/path for immediate review in Slack.

### What failed before the HTML
- Long blueprint prose + YAML package without a single glanceable loop diagram.
- Owner could not “see” the control cycle → weak validation signal.

### Hermes native Learn layer (all domains)
- Every AI Loop design must connect operational evidence to Hermes self-improvement.
- Keep operational state, traces, scores and events in the loop store.
- Use `skill_manage` for recurring procedures or explicit owner corrections.
- Use persistent memory only for durable facts, preferences and constraints; exclude progress, run logs, transient metrics, secrets and raw dumps.
- Require anti-noise evidence before a skill patch: recurrence, measured pattern, or explicit owner correction.
- Treat this as a native capability, not a fake installable `learn` skill.

### Skill rules added
1. HTML blueprint mandatory; generated with architecture-diagram skill.
2. Six-box structure mandatory in both HTML and process design.
3. Exit = owner approval gate (awaiting-approval until APPROVE).
4. Example HTML checked into references/ as quality bar.
5. YAML package remains required for machine handoff downstream.
6. Hermes native learning is mandatory in Learn for every domain.
