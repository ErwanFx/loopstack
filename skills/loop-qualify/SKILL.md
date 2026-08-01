---
name: loop-qualify
description: Use when discovery evidence exists and a business process must be classified before designing an automation or AI system.
---

# Qualify a Loop

## Overview

Choose the simplest correct system type. An AI Loop is justified only when repeated decisions, bounded actions, measurable feedback, and iteration are all present.

## Classify

Select exactly one classification and give evidence for it:

1. AI Loop
2. AI-assisted workflow
3. deterministic automation
4. on-demand agent task
5. monitoring or reporting system
6. human SOP or approval process
7. data pipeline
8. one-time project
9. multiple independent loops requiring decomposition

Prefer deterministic automation when rules fully determine the output. Prefer an on-demand agent task when a human request starts each isolated job. Prefer monitoring when no action closes the feedback cycle. Decompose processes with different owners, feedback horizons, or objectives.

## Readiness

For an AI Loop candidate, map the evidence into the readiness contract and run:

```bash
pnpm loopstack readiness path/to/candidate.yaml
```

A blocker may permit a clearly labelled draft, but it forbids deployable triggers, external write permissions, or activation. An advisory score never bypasses a hard requirement.

## Handoff

Only a qualified AI Loop proceeds to `loop-design`. Other classifications stop with the recommended implementation pattern. A blocked AI Loop stops with exact missing requirements.

```yaml
handoff:
  loop_id: seo-growth
  completed_skill: loop-qualify
  status: completed
  artifacts: [qualification.yaml]
  next_skill: loop-design
  blocking_requirements: []
```
