---
name: loop-idea
description: Use when a recurring business process, automation idea, or operational problem is still vague and needs evidence-led discovery before solution selection.
---

# Loop Idea

## Overview

Run a rigorous, conversational interview before deciding that AI or a loop is appropriate. Gather evidence, expose assumptions, and find the narrowest valuable starting point.

## Interview

1. Read [the interview rubric](references/interview-rubric.md) before starting.
2. Establish the business context, desired change, and why this matters now.
3. Ask one question at a time. Adapt the next question to the answer; do not dump a questionnaire.
4. Request concrete examples, volumes, exceptions, the current workaround, and a direct observation of the process whenever possible.
5. Identify the owner, users, inputs, outputs, systems, permissions, risks, costs, and feedback delay.
6. Challenge vague claims and distinguish observed facts from assumptions.
7. Present at least two plausible alternatives, including a non-loop option, before recommending a direction.

Do not create a deployable loop, trigger, write permission, or implementation plan during discovery.

## Exit Criteria

End with exactly one outcome:

- Continue: evidence is sufficient to qualify the process.
- Block: list the missing evidence and the next question or observation needed.
- Reframe or abandon: explain why a loop would not solve the actual problem.

## Handoff

On “Continue,” validate and emit a handoff to `loop-qualify`. Blocked or abandoned outcomes must have no next skill.

```yaml
handoff:
  loop_id: seo-growth
  completed_skill: loop-idea
  status: completed
  artifacts: [discovery.yaml]
  next_skill: loop-qualify
  blocking_requirements: []
```
