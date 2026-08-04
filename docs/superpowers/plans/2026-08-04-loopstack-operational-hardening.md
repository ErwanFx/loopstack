# Loopstack Operational Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Make the Loopstack CLI, prompt-cycle entrypoint, runtime packages, and Hermès activation artifacts executable and truthfully validated.

**Architecture:** Wrap the existing `runPromptCycle` library with a loop-owned module loader, keep business adapters outside the framework core, and strengthen each runtime boundary with the real CLI and manifest contract. Preserve inert activation and fail-closed behavior.

**Tech Stack:** TypeScript 7, Node.js 20+, Vitest 4, Zod 4, Hermès Agent 0.19/0.20, Claude Code plugin manifests, Codex plugin manifests.

## Global Constraints

- Keep all generated triggers disabled until a separate launch approval.
- Never embed a webhook secret or execute a generated activation command during rendering or validation.
- Keep the existing seven-skill public surface and v1 compatibility aliases.
- Every production behavior change starts with a failing test.

---

### Task 1: Installable CLI and prompt-cycle command

**Files:**
- Modify: `src/cli.ts`
- Create: `src/commands/prompt-cycle.ts`
- Modify: `package.json`
- Modify: `tests/smoke/build-output.test.ts`
- Create: `tests/commands/prompt-cycle.test.ts`

**Interfaces:**
- Consumes: `runPromptCycle(input, dependencies)`.
- Produces: `runPromptCycleCommand(args): Promise<number>` and executable `loopstack prompt-cycle run --loop <id-or-path>`.

- [x] Add failing tests proving the built bin has a Node shebang and a temporary loop module is executed through the command.
- [x] Run the focused tests and confirm the shebang/unknown-command failures.
- [x] Add the shebang, CLI route, module resolver, export validation, structured errors, and `prepare` build script.
- [x] Re-run the focused tests and the prompt-cycle engine tests.

### Task 2: Real runtime plugin packages and validation

**Files:**
- Create: `src/runtimes/package-validation.ts`
- Modify: `src/runtimes/claude-code.ts`
- Modify: `src/runtimes/codex.ts`
- Modify: `tests/runtimes/claude-code.test.ts`
- Modify: `tests/runtimes/codex.test.ts`
- Modify: `tests/smoke/distribution.test.ts`
- Modify: `.codex-plugin/plugin.json`

**Interfaces:**
- Produces: `validateRuntimePackage(packagePath, runtime, loopId): Promise<RuntimeValidation>`.

- [x] Add failing tests requiring canonical manifest locations, strict semantic versions, required Codex interface metadata, and a real `skills/<loop>-loop/SKILL.md`.
- [x] Confirm both old packages are rejected by the new expectations.
- [x] Render canonical Claude/Codex manifests and skills, then replace parse-only validation with semantic validation.
- [x] Re-run adapter and runtime-equivalence tests.

### Task 3: Hermès 0.19/0.20 activation and preflight

**Files:**
- Modify: `src/runtimes/activation-plan.ts`
- Modify: `src/runtimes/hermes.ts`
- Modify: `tests/runtimes/activation-plan.test.ts`
- Modify: `tests/runtimes/hermes.test.ts`

**Interfaces:**
- Produces: inert cron/webhook argument arrays accepted by Hermès 0.19/0.20 and a read-only preflight using `gateway status` plus `webhook list`.

- [x] Replace existing expectations with failing tests for the real Hermès positional contracts and managed webhook secret.
- [x] Add failing preflight tests for a disabled webhook platform and missing profiles/skills.
- [x] Implement the minimal activation and preflight changes without executing activation.
- [x] Re-run Hermès tests and manually submit generated invalid/safe probes to the installed Hermès parser.

### Task 4: Portable repository initialization and documented fixture

**Files:**
- Modify: `src/commands/init-business-repo.ts`
- Modify: `tests/integration/business-repo.test.ts`
- Modify: `tests/fixtures/processes/seo-valid.yaml`
- Modify: `skills/loop-design/references/protocols/functional-design.md`

- [x] Add a failing test that changes the process cwd before creating a business repository.
- [x] Resolve templates from `import.meta.url` and re-run the integration test.
- [x] Add the missing cron schedule to the official valid fixture.
- [x] Correct the three local blueprint links and run the repository link checker.

### Task 5: Preflight truthfulness and build guidance

**Files:**
- Modify: `src/runtimes/claude-code.ts`
- Modify: `src/runtimes/codex.ts`
- Modify: `skills/loop-build/SKILL.md`
- Modify: `README.md`
- Modify: `.github/workflows/ci.yml`
- Modify: runtime and skill tests as required.

- [x] Add failing tests for real Claude/Codex authentication checks, generated wrapper presence, and required tool detection.
- [x] Implement JSON-aware, read-only preflight checks.
- [x] Document CLI installation and the required `prompt-cycle.mjs` contract in the build workflow.
- [x] Add distribution-level CLI/package checks to CI without activating a loop.

### Task 6: Full release verification

- [x] Run `pnpm check`, `pnpm build`, Python compilation, plugin validation, and all skill validators.
- [x] Run the suite with Node 20.
- [x] Pack and install the npm package into a temporary prefix; execute the installed bin and a temporary prompt cycle.
- [x] Render all three runtimes; run official Claude/Codex package validators and Hermès parser probes.
- [x] Run dependency audit, Markdown link validation, tracked-secret scan, `git diff --check`, and confirm no unintended files.
