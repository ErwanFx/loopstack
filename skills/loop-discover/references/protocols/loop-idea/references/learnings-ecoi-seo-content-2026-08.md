# Learnings from first live loop-idea run (ecoi-seo-content, 2026-08)
# Domain-agnostic takeaways applied to skills/loop-idea/

## What worked
- One question at a time kept the user engaged.
- Separating north-star (business lagging) from leading SEO/ops metrics avoided fake weekly “success”.
- Live access checks (GSC via OpenSEO, Velora via Convex CLI) turned folklore into baseline=0 evidence.
- Explicit v1 human gates + progressive autonomy matched the user’s real risk (visual QA, publish).
- Recommending a small **independent** loop store (not cloning the CRM) clarified measurement without data-lake sprawl.
- Writing discovery.yaml under home/loops/{loop_id}/ made handoff concrete.

## What hurt / was missing in the old skill
- No mandate to **verify** named systems in-session.
- No guidance on baseline=0 vs unknown vs estimated.
- No measurement topology (SoT vs leading vs loop-store snapshots).
- No progressive-autonomy / gate-removal framing.
- Example handoff loop_id `seo-growth` invited copy-paste leakage.
- No discovery template → inconsistent artifacts.
- No pause protocol when access is blocked mid-interview.
- Bottleneck discovery was underspecified (assumed process pain ≠ last-run pain).

## Generic rules added to the skill
1. Tools-before-beliefs for every SoT claim.
2. Lagging vs leading vs ops metrics.
3. Independent loop store for state/snapshots/gates only.
4. Progressive autonomy as three layers.
5. Stable artifact paths + template.
6. Domain-agnostic language (SEO only as example, not the frame).
7. Pitfalls + verification checklist for agent self-audit.
8. Exit outcomes include reframe/abandon with null next_skill.

## Still out of scope for loop-idea
- Classification → loop-qualify
- Schema design / Convex project creation → storage skills
- Cron/report implementation → plan/implement/deploy
