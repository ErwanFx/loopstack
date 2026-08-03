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

### Skill rules added
1. HTML blueprint mandatory; generated with architecture-diagram skill.
2. Six-box structure mandatory in both HTML and process design.
3. Exit = owner approval gate (awaiting-approval until APPROVE).
4. Example HTML checked into references/ as quality bar.
5. YAML package remains required for machine handoff downstream.
