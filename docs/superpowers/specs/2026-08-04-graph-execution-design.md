# Loopstack Graph Execution Design

## Decision

Loopstack remains an AI Loop plugin. Graph engineering becomes an internal execution capability, not a replacement product or a mandatory user concept.

The three layers are:

1. **Harness/runtime** — Hermes, Claude Code, or Codex supplies sessions, tools, skills, permissions, and model access.
2. **AI Loop** — Loopstack supplies measurable feedback, durable state, bounded repetition, learning proposals, and human governance over time.
3. **Prompt graph** — an optional `graph.yaml` makes stable execution dependencies, branches, joins, human gates, and controlled cycles explicit inside a run.

The simplest valid loop remains linear. A graph is introduced only when at least one of these is true: a real artifact dependency must be inspected, independent work can fan out, outcomes route differently, results must join, a human interrupt must resume, or a bounded correction cycle must be explicit.

## Product experience

The user continues to describe a business process in natural language. Loopstack's interview selects the least complex architecture:

- deterministic automation when no AI judgment or improvement is needed;
- deterministic operation with AI improvement when execution can be code-only but feedback analysis must learn;
- single-agent multi-session loop as the default AI architecture;
- multi-agent graph only for real specialization, isolation, independent checking, or parallelism.

Generated packages use:

- `loop.yaml` for objective, triggers, feedback, guardrails, service levels, and approvals;
- `process.yaml` for durable business work-item states;
- `graph.yaml` only for the executable topology of a run;
- `prompts/` for prompt content separated from graph structure;
- `skills.yaml`, `tools.yaml`, `storage.yaml`, `approvals.yaml`, `alerts.yaml`, and `evaluations.yaml` for existing concerns.

## Graph contract

`PromptGraphDefinition` is a runtime-neutral, versioned artifact. It contains:

- a stable graph id, loop id, version, entry node, and execution mode;
- agent bindings independent of nodes;
- typed node input/output artifact names;
- data/control edges with declarative conditions and bounded traversals;
- join semantics (`all` or `any`);
- resource locks for hidden write/rate-limit dependencies;
- budgets for steps, cost, wall-clock time, concurrency, and retries;
- immutable evidence anchors and protected nodes;
- an AI improvement contract linked to feedback and versioned learning proposals.

Supported node kinds are `agent`, `skill`, `tool`, `transform`, `router`, `evaluator`, `human-gate`, `join`, and `subgraph`. Multiple nodes may reference the same agent binding.

## Single-agent multi-session default

A graph can reuse one Hermes profile for keyword research, competitive research, writing, review, and publication preparation. Every node invocation starts with a fresh session by default and receives only durable inputs and artifacts, never an entire prior transcript.

For Hermes:

- `profile` selects the independent Hermes home/config/memory/skills identity;
- `session: fresh` is the default node behavior;
- profile existence and required skills are checked read-only before activation;
- default concurrency is `1` unless the detected Hermes executor explicitly proves safe concurrent sessions;
- a profile is not treated as a filesystem sandbox; consequential nodes still require explicit permissions and gates.

Claude Code and Codex use the same graph contract. Their adapters map agent bindings to their native session/subagent mechanisms when available and otherwise execute nodes sequentially through fresh invocations.

## Automation without an operational agent

`deterministic-with-ai-improvement` permits tool and transform nodes to run the business operation without an AI agent. The graph must still contain an AI evaluator/improver node connected to measurable feedback. It may only create a versioned `LearningProposal`; promotion remains subject to tests, completed feedback windows, risk policy, rollback instructions, and approval rules.

A fully deterministic automation with no AI-bearing feedback/improvement node is not classified as an AI Loop.

## Compiler and safety

Compilation performs static validation before any run:

- unique, reachable nodes and valid entrypoint;
- valid agent, prompt, gate, subgraph, and artifact references;
- output artifacts match downstream input contracts;
- cycle edges have traversal caps and graph budgets;
- consequential effects declare idempotency and a resource lock;
- joins declare `all`/`any` semantics;
- independent nodes sharing a resource lock are rejected as falsely parallel;
- data-free sequential edges are reported as possible fake edges;
- the AI improvement node cannot modify protected anchors;
- at least one immutable evidence anchor grounds any auto-improvement policy.

The compiled graph is serializable, inspectable, semantically diffable, and renderable. This satisfies the four prompt-graph properties: explicit structure, structure/content separation, executable semantics, and first-class artifact status.

## Runtime and durability

The core runner is dependency-injected. Loopstack schedules nodes and persists a checkpoint before and after every invocation; runtime adapters provide the actual node executor.

Each checkpoint records graph/version, run/work item, node, attempt, step, status, accumulated cost, traversal counts, state snapshot, artifacts, scheduled nodes, and time. A waiting human/external result ends the active invocation and resumes later from stored state.

The runner supports sequential execution everywhere and bounded parallel batches when the runtime capability and resource locks allow it. It detects missing fan-in results, max-step/cost/deadline exhaustion, unknown side effects, and repeated no-progress states.

## Improvement and governance

Operational evidence feeds an AI improvement node after its declared feedback horizon. The node produces a proposal targeting prompts, project-owned skills, tools, process configuration, or graph topology. It cannot directly change installed Loopstack skills or protected anchors.

Promotion requires replay/evaluation against stored cases, semantic diff, passing QA, rollback instructions, and risk-appropriate approval. Low-risk changes may use the existing policy auto-approval path; medium/high-risk changes remain human-approved.

## QA and example

The SEO reference graph demonstrates:

- one Hermes profile reused across fresh sessions;
- parallel research where safe;
- explicit artifact contracts and a layered join;
- a fresh-context evaluator;
- a publication human gate;
- a delayed ranking feedback window;
- an AI learning proposal that cannot publish or rewrite protected rules directly.

QA covers schema failures, fake/hidden edges, bounded cycles, join completeness, checkpoints/resume, human waiting, deterministic operation with AI improvement, single-profile reuse, runtime rendering equivalence, and semantic graph diffs.

## Out of scope

- No mandatory LangGraph, AutoGen, or Microsoft Agent Framework dependency.
- No visual drag-and-drop platform in this release.
- No silent self-modification.
- No automatic creation of Hermes profiles or live triggers during design.
- No assumption that more agents improve quality.

