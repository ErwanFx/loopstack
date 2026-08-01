---
name: using-loopstack
description: Use when someone wants to automate, improve, monitor, or repeatedly execute a business process and needs to decide whether Loopstack applies.
---

# Using Loopstack

## Overview

Route an automation idea through evidence, qualification, design, review, planning, approval, implementation, QA, deployment, and learning. Answer in the user's language.

## Route

1. Start with `loop-idea` for any new or materially changed process.
2. Respect every readiness, human-approval, QA, and deployment gate.
3. Resume from an existing handoff only after validating it with Loopstack.
4. Never skip directly to implementation because the user already prefers an AI solution.

Use deterministic commands from the repository root for validation. Treat declarative loop artifacts as the source of truth.

## Handoff

Start `loop-idea`. Do not emit a later next skill for a new idea.

```yaml
handoff:
  loop_id: pending
  completed_skill: using-loopstack
  status: completed
  artifacts: []
  next_skill: loop-idea
  blocking_requirements: []
```
