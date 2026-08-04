# Prompt graph contract

Use this reference only after discovery has justified graph engineering. An AI Loop is the business control system; its optional prompt graph is the executable dependency map inside a run; the runtime harness provides sessions, tools, checkpoints, budgets, and recovery.

## Simplicity gate

Omit `graph.yaml` for a short linear sequence. Add it only for a real conditional branch, fan-out/fan-in, bounded correction cycle, human wait, resource ordering, or resumable recovery. More nodes do not automatically mean more agents.

## Required artifact

`graph.yaml` must declare `schemaVersion`, loop/graph id and version, execution mode, entrypoint, budgets, agent bindings, nodes, edges, immutable anchors, and the improvement policy. Long prompts live in separate versioned files referenced by `promptRef`; keep prompts separate from graph topology.

Each node has one bounded purpose and typed `inputs` and `outputs`. Agent, skill, tool, transform, router, evaluator, human-gate, join, and subgraph nodes are allowed. Consequential nodes require a stable idempotency key, a resource lock, and a reconciliation path for unknown effects.

Each edge must pass the **fake-edge test**: the target consumes a declared artifact, a condition controls routing, or a documented resource/control dependency requires order. Shared writable resources are hidden edges and must be ordered or locked.

## Scheduling and safety

- Checkpoint immediately before and after every node.
- Bound steps, cost, duration, retries, concurrency, and every cycle.
- A join with `activation: all` must receive every expected edge. Missing fan-in terminates with `FAN_IN_INCOMPLETE`; never synthesize from silent partial results.
- A reviewer/evaluator runs in a fresh context and has no consequential write tools. It must not validate its own hidden session state.
- Parallel branches return typed artifacts; reduce deterministically before synthesis when context would otherwise collapse.
- An interrupted consequential node escalates until its side effect is reconciled.

## Profiles and portability

The default for agentic work is one agent profile, `sessionPolicy: fresh`, reused by multiple nodes. A `deterministic-with-ai-improvement` graph may instead use a model-backed AI evaluator with no autonomous agent profile. On Hermes, one profile owns its config, SOUL, memory, sessions, skills, cron, and gateway state; profile switching is process-global, so default to `maxConcurrency: 1`. A new profile is for isolation—not for every task.

Claude Code may use optional dynamic workflows for parallel fresh-context workers. Claude Code and Codex must also support the Loopstack durable sequential fallback. Keep the canonical graph runtime-neutral with `runtime: portable`; runtime packages add bindings without changing topology.

## Learning boundary

Every AI Loop records feedback. Auto-improvement is governed experimentation, not silent self-modification. The improvement node emits a proposal only after the configured feedback windows and evaluation suite. An immutable evidence anchor and protected node list constrain it. Never auto-edit active graph, prompts, installed/plugin skills, human gates, permissions, evidence anchors, or evaluation rules. Validate, approve, version, canary, and retain rollback before promotion.

## Validation

```bash
loopstack graph validate path/to/graph.yaml
loopstack graph inspect path/to/graph.yaml
```

Graph QA covers branch routing, all/any joins, cycle bounds, checkpoints/resume, cost and deadline limits, locks, idempotency, unknown effects, runtime equivalence, and topology hash pinning.
