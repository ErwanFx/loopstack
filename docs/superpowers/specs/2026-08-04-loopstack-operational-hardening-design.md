# Loopstack Operational Hardening Design

## Goal

Make Loopstack 0.4 executable from a normal installation, and make every generated runtime package fail closed unless it can actually be installed and activated by the selected runtime.

## Architecture

Keep the existing portable prompt-cycle engine and runtime adapters. Add a small CLI loader around the engine: `loopstack prompt-cycle run --loop <id-or-path>` resolves a loop-owned `prompt-cycle.mjs`, asks it for the concrete input, store, invoker, and evaluator, then runs the existing bounded controller. The business module owns domain actions and runtime calls; Loopstack continues to own limits, repeated prompts, checkpoints, waits, and terminal decisions.

Generated Claude Code and Codex packages become real installable plugins with canonical manifest locations, strict semantic versions, and a discoverable loop skill. Hermès keeps an inert activation plan, but every emitted argument must match Hermès Agent 0.19/0.20: cron and webhook activation use their real positional/option contracts, webhook secrets remain Hermès-managed, and verification is read-only.

## Operational contracts

- The npm bin starts with `#!/usr/bin/env node`; a packed local installation must execute `loopstack --help` directly.
- A loop implementation exposes `createPromptCycleRun(context)` from `prompt-cycle.mjs` and returns `{ input, dependencies }` compatible with `runPromptCycle`.
- A bare loop id resolves to `<cwd>/loops/<loop-id>/prompt-cycle.mjs`; a directory resolves to `<directory>/prompt-cycle.mjs`; an explicit JavaScript module path is accepted.
- Missing modules, exports, or invalid results stop with a structured `PROMPT_CYCLE_FAILED` error and a non-zero exit code.
- Runtime validators verify manifest shape, semantic version, canonical location, runtime metadata, and the generated skill instead of only parsing `runtime.json`.
- Runtime preflights verify authentication, the loop wrapper plugin, required tools, Hermès profiles/skills, and actual webhook availability. They never provision or mutate anything.
- Business-repository templates resolve relative to the installed Loopstack module, not the caller's current directory.

## Safety

Activation remains disabled in every generated package. Hermès webhook secrets are auto-generated and stored by Hermès rather than embedded in Loopstack artifacts. Cron verification lists jobs without triggering a business run. Prompt-cycle interruption, budgets, no-progress detection, human waits, and unknown side-effect reconciliation remain fail-closed in the existing engine.

## Verification

Use TDD for every executable change. Add end-to-end tests for the CLI loader, packed-bin header, runtime package validation, Hermès 0.19/0.20 argument contracts, read-only preflights, and template resolution from another working directory. Finish with the complete suite under Node 20 and the local Node version, clean-archive installation, official Claude/Codex validators, real Hermès parser checks, dependency audit, link check, and secret scan.
