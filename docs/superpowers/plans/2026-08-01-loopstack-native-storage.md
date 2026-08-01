# Loopstack Native Storage Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Generate, approve, execute through native agent tools, and verify a common operational-memory schema for Convex, Airtable, or Google Sheets without embedded provider API clients.

**Architecture:** TypeScript owns canonical schemas, deterministic provider blueprints, capability checks, plan hashing, and evidence validation. Host-neutral skills instruct Hermes or Claude Code to use an already authenticated MCP, CLI, or skill only after explicit plan approval.

**Tech Stack:** Node.js 22, TypeScript, Zod, Vitest, YAML, Markdown skills.

## Global Constraints

- Do not call Convex, Airtable, or Google APIs from Loopstack production code.
- Never store credentials in manifests, fixtures, logs, or Git.
- Use shared logical entities separated by `loopId`; Google Sheets may use one workbook per loop.
- Provisioning is non-destructive by default and requires an unexpired matching approval.
- Missing native capability, authentication, permission, or verification evidence blocks activation.

---

### Task 1: Canonical memory schema and provider blueprints

**Files:**
- Create: `src/storage/schema.ts`
- Create: `src/storage/blueprints.ts`
- Create: `tests/storage/blueprints.test.ts`

**Interfaces:**
- Produces: `logicalEntities`, `createStorageBlueprint(provider, loopId)`, `StorageBlueprintSchema`.

- [ ] **Step 1: Write the failing blueprint test**

Assert that Convex and Airtable use shared resources containing a `loopId` field, Sheets uses one workbook per loop with entity worksheets, every provider includes schema version `1`, and no operation is destructive.

- [ ] **Step 2: Verify RED**

Run: `pnpm test -- tests/storage/blueprints.test.ts`

Expected: FAIL because `src/storage/blueprints.ts` is missing.

- [ ] **Step 3: Implement the minimal schemas and generators**

Define these entities exactly: `loops`, `loopVersions`, `runs`, `events`, `observations`, `decisions`, `actions`, `actionResults`, `approvals`, `evaluations`, `alerts`, `learnings`, `costs`, `heartbeats`, `toolConnections`. Each record contract includes `loopId`; run-scoped entities also include `runId`, `eventId`, `timestamp`, and `idempotencyKey`. Mark events and decisions append-only.

- [ ] **Step 4: Verify GREEN and commit**

Run: `pnpm test -- tests/storage/blueprints.test.ts && pnpm build`

Commit: `feat: add native storage blueprints`

### Task 2: Native capability and connection evidence gate

**Files:**
- Create: `src/storage/capabilities.ts`
- Create: `src/storage/connection.ts`
- Create: `tests/storage/connection.test.ts`

**Interfaces:**
- Produces: `evaluateNativeConnection(input): ConnectionReport` and `NativeCapabilitySchema`.

- [ ] **Step 1: Write failing connection tests**

Test that an authenticated read-capable Convex tool passes discovery but remains unverified for provisioning without schema-write permission; test that Airtable with read, schema-write, and tested alert evidence is `ready`; test that credentials embedded in evidence are rejected.

- [ ] **Step 2: Verify RED**

Run: `pnpm test -- tests/storage/connection.test.ts`

Expected: FAIL because the connection gate is missing.

- [ ] **Step 3: Implement the evidence-only gate**

Require provider, runtime, capability kind (`mcp`, `cli`, `skill`, or `tool`), authenticated status, read permission, schema-write permission, connection check timestamp, and redacted evidence. Return stable blockers without executing provider commands.

- [ ] **Step 4: Verify GREEN and commit**

Run: `pnpm test -- tests/storage/connection.test.ts && pnpm check`

Commit: `feat: validate native storage connections`

### Task 3: Provisioning plan approval and verification

**Files:**
- Create: `src/storage/provisioning.ts`
- Create: `src/domain/approval-token.ts`
- Create: `tests/storage/provisioning.test.ts`

**Interfaces:**
- Produces: `createProvisioningPlan`, `approvePlan`, `authorizeProvisioning`, `verifyProvisioningEvidence`.

- [ ] **Step 1: Write failing approval tests**

Test refusal without approval (`PLAN_APPROVAL_REQUIRED`), invalidation after one operation changes (`PLAN_HASH_MISMATCH`), expiry (`PLAN_APPROVAL_EXPIRED`), and successful verification only when all planned resources appear in redacted evidence.

- [ ] **Step 2: Verify RED**

Run: `pnpm test -- tests/storage/provisioning.test.ts`

Expected: FAIL because provisioning functions are missing.

- [ ] **Step 3: Implement canonical hashing and evidence verification**

Hash canonical JSON containing provider, environment, loop ID, schema version, operations, and expiry with SHA-256. Approval records contain plan hash, approver, approved timestamp, environment, and expiry. Authorization returns instructions; it performs no provider call.

- [ ] **Step 4: Verify GREEN and commit**

Run: `pnpm test -- tests/storage/provisioning.test.ts && pnpm build`

Commit: `feat: gate native storage provisioning`

### Task 4: Storage skills and CLI artifacts

**Files:**
- Create: `skills/loop-storage-design/SKILL.md`
- Create: `skills/loop-connection-check/SKILL.md`
- Create: `skills/loop-storage-setup/SKILL.md`
- Create: `src/commands/storage-plan.ts`
- Create: `src/commands/storage-verify.ts`
- Create: `tests/skills/storage-skills.test.ts`
- Create: `tests/integration/storage-commands.test.ts`
- Modify: `src/domain/handoff.ts`
- Modify: `src/cli.ts`

**Interfaces:**
- Produces: `loopstack storage plan` and `loopstack storage verify`; routes `loop-design → loop-storage-design → loop-connection-check → loop-storage-setup → loop-eric-review`.

- [ ] **Step 1: Write failing skill and command tests**

Assert valid frontmatter and handoffs, explicit native-connection language, an approval stop before mutations, plan generation for all providers, and verification failure when one resource is missing.

- [ ] **Step 2: Verify RED**

Run: `pnpm test -- tests/skills/storage-skills.test.ts tests/integration/storage-commands.test.ts`

Expected: FAIL because skills and commands are absent.

- [ ] **Step 3: Implement skills one at a time and validate each**

Initialize each skill with `init_skill.py`, replace the template with concise imperative instructions, run its focused test, then run `quick_validate.py`. The setup skill must output native tool instructions and stop until explicit approval; it must never claim that Loopstack itself connected to a provider.

- [ ] **Step 4: Implement commands and routing**

`storage plan --provider <provider> --loop-id <id> --environment <env> --out <file>` writes a deterministic plan. `storage verify --plan <file> --evidence <file>` prints a report and exits `2` when incomplete. Add the three skills to the handoff graph.

- [ ] **Step 5: Verify GREEN and commit**

Run: `pnpm check`, validate every skill, generate all three plans under `.tmp/`, and confirm `git status --short` contains no untracked generated artifacts.

Commit: `feat: add native storage setup workflow`

## Completion gate

Run:

```bash
pnpm check
pnpm build
for skill in skills/*; do python3 "$CODEX_SKILLS_DIR/skill-creator/scripts/quick_validate.py" "$skill"; done
python3 "$CODEX_SKILLS_DIR/plugin-creator/scripts/validate_plugin.py" .
git status --short
```

Expected: all checks pass and the worktree is clean.
