# Loopstack Implementation Roadmap

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver the Loopstack plugin and a separate Business Loops repository through four independently testable implementation plans.

**Architecture:** Loopstack supplies host-neutral workflow skills, strict schemas, lifecycle routing, runtime and storage adapters, QA, and operations. Business loop definitions remain in a separate generated repository and are executed by Hermes or Claude Code using one of three interchangeable storage backends.

**Tech Stack:** Node.js 22, pnpm 10, TypeScript, Vitest, Zod, YAML, JSON Schema, Hermes Agent skills, Claude Code skills/plugins, Convex, Airtable Web API, Google Sheets API.

## Global Constraints

- Hermes Agent is the primary runtime; Claude Code support ships in the first release.
- Business loops live in a separate repository and may invoke multiple skills.
- No deployable loop is created until all hard readiness requirements pass.
- No external mutation occurs before approval of a versioned implementation plan.
- Material plan deviations require a new approval.
- Every deployment passes static, connection, contract, scenario, approval, idempotency, alert, shadow, and canary gates.
- Convex, Airtable, and Google Sheets must all be usable storage choices.
- Structural self-modification is never silent; it follows plan, approval, QA, and versioning.
- The MVP exposes platform-ready events and identifiers but does not build a web interface.

---

## Plan order

1. [Core Plugin and Skill Workflow](2026-08-01-loopstack-core.md)
   - Plugin scaffold and toolchain
   - Domain schemas and lifecycle state machine
   - Handoff enforcement
   - Core interview, qualification, design, review, and planning skills
   - Host-neutral skill validation

2. [Runtime Adapters](2026-08-01-loopstack-runtimes.md)
   - Runtime contract
   - Hermes packaging, triggers, skills, and delivery
   - Claude Code packaging and permission mapping
   - Runtime-specific wrappers and contract tests

3. [Storage Adapters](2026-08-01-loopstack-storage.md)
   - Common storage contract
   - Convex, Airtable, and Google Sheets implementations
   - Connection preflight and schema provisioning
   - Idempotency and migration tests

4. [QA, Operations, and End-to-End Validation](2026-08-01-loopstack-operations.md)
   - QA runner and activation verdict
   - Registry, list, show, lifecycle administration
   - Alerts, watchdog, recovery, modification, and improvement
   - Separate Business Loops repository template
   - SEO shadow fixture and cross-runtime end-to-end tests

## Release gates

- Plan 1 gate: a host-neutral interview can route through qualification, design review, and a non-mutating implementation plan.
- Plan 2 gate: the same fixture produces valid Hermes and Claude Code packages.
- Plan 3 gate: the shared contract suite passes against all three storage adapters using mocks or local test doubles; live preflight tests are opt-in.
- Plan 4 gate: the SEO fixture completes a shadow run, records the full decision trail, handles injected failures, emits an alert, and appears correctly in `loop-list`.

## Execution rule

Implement plans in order. Do not begin a later plan until the preceding plan's tests and review gate pass. Commit each task separately as specified in its plan.

