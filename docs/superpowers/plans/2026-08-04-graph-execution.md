# Loopstack Graph Execution Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a portable, optional prompt-graph execution layer to Loopstack while preserving simple single-agent and deterministic-with-AI-improvement loops.

**Architecture:** A Zod-backed `PromptGraphDefinition` is compiled into a validated runtime-neutral artifact, then executed by a durable scheduler through injected node executors. Hermes, Claude Code, and Codex adapters render the same contract with runtime-specific profile/session capabilities; lifecycle skills select the least complex architecture and generate `graph.yaml` only when justified.

**Tech Stack:** TypeScript 7, Zod 4, YAML, Vitest, existing Loopstack runtime adapters and storage/learning contracts.

## Global Constraints

- Preserve the public seven-skill plugin surface.
- Keep Hermes, Claude Code, and Codex packages semantically equivalent.
- Hermes is the primary runtime and defaults to one profile reused over fresh sequential sessions.
- Allow code-only operation only when an AI feedback/improvement node exists.
- Do not add LangGraph, AutoGen, or another runtime dependency.
- Do not activate triggers, create profiles, provision storage, or mutate external systems.
- All cycles, costs, retries, concurrency, and side effects are bounded.
- Installed Loopstack skills and evidence anchors are not auto-modifiable.

---

### Task 1: Prompt graph schema and compiler

**Files:**
- Create: `src/graph/schemas.ts`
- Create: `src/graph/types.ts`
- Create: `src/graph/compiler.ts`
- Test: `tests/graph/compiler.test.ts`

**Interfaces:**
- Produces: `PromptGraphDefinitionSchema`, `PromptGraphDefinition`, `compilePromptGraph(definition): CompiledPromptGraph`, `GraphCompileError`.
- `CompiledPromptGraph` exposes the parsed definition, node/agent maps, incoming/outgoing edge maps, warnings, and a stable topology hash.

- [ ] Write failing tests for a valid single-profile graph, invalid references, artifact mismatch, unbounded cycles, consequential actions without idempotency, fake edges, hidden shared-resource dependencies, and deterministic operation without AI improvement.
- [ ] Run `pnpm vitest run tests/graph/compiler.test.ts` and confirm failures are caused by missing graph modules.
- [ ] Implement discriminated node schemas, agent bindings, declarative edge conditions, budgets, anchors, and improvement policy.
- [ ] Implement compilation, reachability, artifact-contract, cycle, resource-lock, anchor, and fake-edge checks.
- [ ] Run the focused test until green, then run `pnpm test`.

### Task 2: Durable graph runner

**Files:**
- Create: `src/graph/runner.ts`
- Create: `src/graph/runtime-types.ts`
- Test: `tests/graph/runner.test.ts`

**Interfaces:**
- Consumes: `CompiledPromptGraph`.
- Produces: `runPromptGraph(input, dependencies): Promise<GraphRunOutcome>`.
- Dependencies: `GraphNodeExecutor`, `GraphCheckpointStore`, and optional `now()`; no runtime process spawning in the core.

- [ ] Write failing tests for sequential scheduling, conditional routing, bounded correction cycles, `all` and `any` joins, missing fan-in detection, human wait/resume, cost/step/deadline limits, and resource-safe concurrency.
- [ ] Run `pnpm vitest run tests/graph/runner.test.ts` and verify RED.
- [ ] Implement immutable run state, before/after checkpoints, edge traversal counts, declarative condition evaluation, scheduling, join readiness, and terminal outcomes.
- [ ] Add resume from stored checkpoint without re-running completed nodes; unresolved consequential invocations escalate.
- [ ] Run focused and full tests.

### Task 3: Runtime profile/session adapters

**Files:**
- Modify: `src/runtimes/types.ts`
- Modify: `src/runtimes/hermes.ts`
- Modify: `src/runtimes/claude-code.ts`
- Modify: `src/runtimes/codex.ts`
- Modify: `src/runtimes/normalize.ts`
- Test: `tests/runtimes/hermes.test.ts`
- Test: `tests/runtimes/claude-code.test.ts`
- Test: `tests/runtimes/codex.test.ts`
- Test: `tests/integration/runtime-equivalence.test.ts`

**Interfaces:**
- `RuntimeRenderInput.graph?: PromptGraphDefinition`.
- `RuntimePreflightInput.graph?: PromptGraphDefinition`.
- Runtime packages add `graphExecution` with entry contract, execution mode, agent bindings, session policy, and capabilities.

- [ ] Write failing tests showing multiple nodes reuse one Hermes profile with `fresh` sessions, Hermes defaults to concurrency one, missing profiles/skills block preflight, and all runtimes preserve the same canonical graph.
- [ ] Run the runtime-focused tests and verify RED.
- [ ] Render `graph.json` and runtime binding files without activating anything.
- [ ] Add read-only Hermes profile/skills checks and capability fallbacks; never create a profile from preflight.
- [ ] Add Claude dynamic-workflow capability metadata without requiring it, plus sequential fallback for Claude and Codex.
- [ ] Run runtime and full tests.

### Task 4: CLI, schemas, semantic diff, and SEO example

**Files:**
- Create: `src/commands/graph.ts`
- Modify: `src/cli.ts`
- Modify: `scripts/export-schemas.ts`
- Modify: `scripts/check-schemas.ts`
- Modify: `src/operations/semantic-diff.ts`
- Create: `examples/seo/graph.yaml`
- Create: `examples/seo/prompts/keyword-research.md`
- Create: `examples/seo/prompts/article-writing.md`
- Create: `examples/seo/prompts/seo-review.md`
- Test: `tests/commands/graph.test.ts`
- Test: `tests/e2e/seo-graph.test.ts`
- Test: `tests/operations/versioning.test.ts`

**Interfaces:**
- `loopstack graph validate <graph.yaml>` returns structured errors/warnings.
- `loopstack graph inspect <graph.yaml>` returns nodes, edges, modes, agents, anchors, budgets, warnings, and topology hash.
- Schema export adds `schemas/graph.schema.json`.

- [ ] Write failing command, example, and semantic-diff tests.
- [ ] Verify RED with focused Vitest commands.
- [ ] Implement CLI validation/inspection and schema export.
- [ ] Extend semantic classification so graph permission/gate/anchor changes are high-risk and topology changes require graph QA.
- [ ] Add and validate the SEO single-profile multi-session example.
- [ ] Run focused and full tests.

### Task 5: Portable skills and design protocol

**Files:**
- Modify: `skills/loop-discover/SKILL.md`
- Modify: `skills/loop-discover/references/protocols/loop-qualify/SKILL.md`
- Modify: `skills/loop-design/SKILL.md`
- Modify: `skills/loop-design/references/protocols/functional-design.md`
- Modify: `skills/loop-plan/SKILL.md`
- Modify: `skills/loop-build/SKILL.md`
- Modify: `skills/loop-launch/SKILL.md`
- Modify: `skills/loop-operate/SKILL.md`
- Test: `tests/skills/graph-engineering.test.ts`

**Interfaces:**
- Discovery outputs `execution_mode` and graph-necessity evidence.
- Design emits `graph.yaml` only when justified and keeps prompts separate.
- Plan/build/launch/operate validate, test, deploy, and observe node-level graph evidence.

- [ ] Write failing conformance scenarios for single-agent default, deterministic-with-AI-improvement, no-graph qualification, fresh reviewer context, evidence anchors, runtime portability, and prohibited silent self-modification.
- [ ] Run `pnpm vitest run tests/skills/graph-engineering.test.ts` and verify RED.
- [ ] Update one lifecycle skill at a time and re-run its focused tests before proceeding.
- [ ] Keep detailed graph contracts in one direct reference file to avoid bloating public SKILL.md files.
- [ ] Run skill checks and full tests.

### Task 6: Release metadata and full verification

**Files:**
- Modify: `README.md`
- Modify: `package.json`
- Modify: `plugin.yaml`
- Modify: `.codex-plugin/plugin.json`
- Modify: `.claude-plugin/plugin.json`
- Modify: `.claude-plugin/marketplace.json`
- Modify: `.agents/plugins/marketplace.json`
- Modify: golden runtime fixtures as required by intentional contract changes.

**Interfaces:**
- Release version: `0.4.0` before the Codex local cachebuster is applied.

- [ ] Update docs with the harness/loop/graph distinction and simplest-first selection.
- [ ] Regenerate JSON schemas and build output.
- [ ] Run `pnpm check`, plugin validation, Hermes Python compilation, and secret scanning.
- [ ] Apply the Codex plugin cachebuster helper only after repository verification.
- [ ] Re-run validation after the cachebuster and record exact results.
- [ ] Commit the verified implementation without pushing unless explicitly requested.

