# Loopstack Storage Adapters Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Convex, Airtable, and Google Sheets interchangeable, testable storage choices for loop definitions, runs, evidence, decisions, actions, approvals, alerts, and learnings.

**Architecture:** A typed append-oriented storage contract defines logical entities and idempotent operations. Each provider adapter maps the contract to provider-native resources and supplies read-only preflight, provisioning-plan generation, apply, and contract-test support.

**Tech Stack:** TypeScript, Vitest, Zod, Convex TypeScript schema/functions, Airtable Web API, Google Sheets API.

## Global Constraints

- Never store raw credentials in manifests, fixtures, logs, or Git.
- Live provider tests are opt-in and use dedicated test resources.
- Provisioning requires an approved plan and must be idempotent.
- Provider adapters must pass the same contract suite.
- Append-only decision history may not be silently overwritten.
- All writes carry `loopId`, `runId`, `eventId`, and an idempotency key.

---

## File map

```text
src/storage/types.ts                     Storage contract and entity types
src/storage/base.ts                      Shared idempotency and validation
src/storage/registry.ts                  Adapter selection
src/storage/convex/*                     Convex adapter and generated schema
src/storage/airtable/*                   Airtable adapter and schema plan
src/storage/google-sheets/*              Sheets adapter and sheet plan
src/commands/storage-preflight.ts        Safe connection checks
src/commands/storage-plan.ts             Provisioning plan generation
src/commands/storage-apply.ts            Approved provisioning execution
tests/storage/contract.ts                Shared adapter contract suite
tests/storage/fakes/*                    In-memory provider test doubles
tests/storage/*.test.ts                  Provider tests
```

### Task 1: Define the common storage contract and in-memory reference adapter

**Files:**
- Create: `src/storage/types.ts`
- Create: `src/storage/base.ts`
- Create: `src/storage/registry.ts`
- Create: `src/storage/memory.ts`
- Create: `tests/storage/contract.ts`
- Create: `tests/storage/memory.test.ts`

**Interfaces:**
- Produces: `LoopStorage`, `StoragePreflight`, `ProvisioningPlan`, `MemoryLoopStorage`, `runStorageContract(factory)`.

- [ ] **Step 1: Write the failing shared contract**

Define and exercise these exact methods:

```ts
export interface LoopStorage {
  preflight(): Promise<StoragePreflight>;
  planProvisioning(): Promise<ProvisioningPlan>;
  registerLoop(loop: LoopRecord): Promise<void>;
  createRun(run: RunRecord): Promise<void>;
  appendEvent(event: EventRecord): Promise<"created" | "duplicate">;
  recordObservation(value: ObservationRecord): Promise<void>;
  recordDecision(value: DecisionRecord): Promise<void>;
  recordAction(value: ActionRecord): Promise<void>;
  recordActionResult(value: ActionResultRecord): Promise<void>;
  requestApproval(value: ApprovalRecord): Promise<void>;
  resolveApproval(id: string, resolution: ApprovalResolution): Promise<void>;
  recordEvaluation(value: EvaluationRecord): Promise<void>;
  recordAlert(value: AlertRecord): Promise<void>;
  recordLearning(value: LearningRecord): Promise<void>;
  recordCost(value: CostRecord): Promise<void>;
  recordToolConnection(value: ToolConnectionRecord): Promise<void>;
  heartbeat(value: HeartbeatRecord): Promise<void>;
  closeRun(runId: string, outcome: RunOutcome): Promise<void>;
  getRun(runId: string): Promise<RunSnapshot | null>;
  listLoops(filter?: LoopListFilter): Promise<LoopSummary[]>;
}
```

The contract must verify duplicate event suppression, immutable decision history, approval state transitions, cost/token accounting, runtime/profile identifiers, tool-connection health, target/current/gap snapshots, and complete run reconstruction.

- [ ] **Step 2: Verify failure**

Run: `pnpm test -- tests/storage/memory.test.ts`

Expected: FAIL because the storage contract is missing.

- [ ] **Step 3: Implement record schemas and memory adapter**

Use Zod validation at every boundary. Reject duplicate entity IDs with different payload hashes. Return `duplicate` only when the idempotency key and payload hash both match.

- [ ] **Step 4: Run and commit**

Run: `pnpm test -- tests/storage/memory.test.ts`

```bash
git add src/storage tests/storage
git commit -m "feat: define loop storage contract"
```

### Task 2: Implement Convex provisioning and adapter

**Files:**
- Create: `src/storage/convex/adapter.ts`
- Create: `src/storage/convex/client.ts`
- Create: `src/storage/convex/provisioning.ts`
- Create: `templates/storage/convex/schema.ts`
- Create: `templates/storage/convex/loopstack.ts`
- Create: `tests/storage/convex.test.ts`
- Create: `tests/storage/fakes/convex.ts`

**Interfaces:**
- Produces: `ConvexLoopStorage`, `createConvexProvisioningPlan(config)`.

- [ ] **Step 1: Write failing Convex contract tests**

Run `runStorageContract` against a fake Convex client. Assert that the plan creates indexed tables for loops, versions, runs, events, observations, decisions, actions, results, approvals, evaluations, alerts, learnings, connections, and heartbeats.

```ts
expect(plan.operations.map((op) => op.resource)).toContain("events.by_idempotency_key");
expect(plan.operations.every((op) => op.destructive === false)).toBe(true);
```

- [ ] **Step 2: Verify failure**

Run: `pnpm test -- tests/storage/convex.test.ts`

Expected: FAIL because the adapter is absent.

- [ ] **Step 3: Implement Convex templates and adapter**

Generate `convex/schema.ts` and internal mutations/queries with provider-native indexes. Use one mutation per contract write. Store canonical JSON payload hashes for idempotency and include schema version metadata.

- [ ] **Step 4: Implement non-mutating preflight**

Check project URL/deployment environment references, CLI availability, authentication status, and existing Loopstack schema version through an injectable runner/client. Do not deploy during preflight.

- [ ] **Step 5: Run contract tests and commit**

Run: `pnpm test -- tests/storage/convex.test.ts`

```bash
git add src/storage/convex templates/storage/convex tests/storage/convex.test.ts tests/storage/fakes/convex.ts
git commit -m "feat: add Convex storage adapter"
```

### Task 3: Implement Airtable provisioning and adapter

**Files:**
- Create: `src/storage/airtable/adapter.ts`
- Create: `src/storage/airtable/client.ts`
- Create: `src/storage/airtable/provisioning.ts`
- Create: `src/storage/airtable/schema.ts`
- Create: `tests/storage/airtable.test.ts`
- Create: `tests/storage/fakes/airtable.ts`

**Interfaces:**
- Produces: `AirtableLoopStorage`, `createAirtableProvisioningPlan(config)`.

- [ ] **Step 1: Write failing Airtable contract tests**

Assert table and field plans, linked record relationships, provider pagination, rate-limit retry behavior, idempotency lookup, and failure when schema-write permission is absent.

```ts
expect(plan.blockers).toContainEqual({ code: "AIRTABLE_SCHEMA_WRITE_REQUIRED" });
```

- [ ] **Step 2: Verify failure**

Run: `pnpm test -- tests/storage/airtable.test.ts`

Expected: FAIL because the adapter is absent.

- [ ] **Step 3: Implement Airtable mapping**

Use stable field names prefixed with `Loopstack`. Keep large structured payloads as canonical JSON text and index identity fields with dedicated columns. Batch writes within Airtable API limits and retry `429` responses using `Retry-After`.

- [ ] **Step 4: Implement read-only preflight and provisioning plan**

Verify token access, base existence, metadata/schema permissions, existing table compatibility, and conflicting field types. The apply operation refuses destructive type changes and returns a migration blocker.

- [ ] **Step 5: Run and commit**

Run: `pnpm test -- tests/storage/airtable.test.ts`

```bash
git add src/storage/airtable tests/storage/airtable.test.ts tests/storage/fakes/airtable.ts
git commit -m "feat: add Airtable storage adapter"
```

### Task 4: Implement Google Sheets provisioning and adapter

**Files:**
- Create: `src/storage/google-sheets/adapter.ts`
- Create: `src/storage/google-sheets/client.ts`
- Create: `src/storage/google-sheets/provisioning.ts`
- Create: `src/storage/google-sheets/schema.ts`
- Create: `tests/storage/google-sheets.test.ts`
- Create: `tests/storage/fakes/google-sheets.ts`

**Interfaces:**
- Produces: `GoogleSheetsLoopStorage`, `createGoogleSheetsProvisioningPlan(config)`.

- [ ] **Step 1: Write failing Sheets contract tests**

Assert one worksheet per logical entity, frozen schema header rows, hidden schema metadata sheet, idempotency lookup, append-only event order, OAuth/sheet permission preflight, and safe handling of partial batch updates.

- [ ] **Step 2: Verify failure**

Run: `pnpm test -- tests/storage/google-sheets.test.ts`

Expected: FAIL because the adapter is absent.

- [ ] **Step 3: Implement Sheets mapping**

Use stable column keys rather than display labels. Store an ISO timestamp and canonical JSON payload on every append. Maintain `_loopstack_schema` with schema version, worksheet IDs, and header hashes. Refuse to write when headers drift.

- [ ] **Step 4: Implement preflight and repair plan**

Verify spreadsheet read/write access, required worksheets, header hashes, and row capacity. Drift produces a repair plan; it does not mutate automatically.

- [ ] **Step 5: Run and commit**

Run: `pnpm test -- tests/storage/google-sheets.test.ts`

```bash
git add src/storage/google-sheets tests/storage/google-sheets.test.ts tests/storage/fakes/google-sheets.ts
git commit -m "feat: add Google Sheets storage adapter"
```

### Task 5: Add storage preflight, plan, and approved apply commands

**Files:**
- Create: `src/commands/storage-preflight.ts`
- Create: `src/commands/storage-plan.ts`
- Create: `src/commands/storage-apply.ts`
- Create: `src/domain/approval-token.ts`
- Create: `tests/integration/storage-commands.test.ts`
- Modify: `src/cli.ts`

**Interfaces:**
- Produces: `loopstack storage preflight`, `storage plan`, and `storage apply`.

- [ ] **Step 1: Write failing approval-boundary tests**

```ts
it("refuses apply without a matching approved plan hash", async () => {
  await expect(applyProvisioning({ plan, approval: null })).rejects.toMatchObject({
    code: "PLAN_APPROVAL_REQUIRED"
  });
});

it("invalidates approval after plan modification", async () => {
  const approval = approve(plan);
  const modified = { ...plan, operations: [...plan.operations, extraOperation] };
  await expect(applyProvisioning({ plan: modified, approval })).rejects.toMatchObject({
    code: "PLAN_HASH_MISMATCH"
  });
});
```

- [ ] **Step 2: Verify failure**

Run: `pnpm test -- tests/integration/storage-commands.test.ts`

Expected: FAIL because approval tokens and commands are missing.

- [ ] **Step 3: Implement plan hashing and apply enforcement**

Hash canonical JSON containing provider, environment, operations, schema version, and expiry. Approval records contain plan hash, approver, timestamp, permitted environment, and expiry. Apply emits an audit event for every operation.

- [ ] **Step 4: Implement CLI commands**

```bash
pnpm loopstack storage preflight --provider convex --config loop/storage.yaml
pnpm loopstack storage plan --provider airtable --config loop/storage.yaml --out plan.json
pnpm loopstack storage apply --plan plan.json --approval approval.json
```

Live operations require `--live`; tests omit it and use fakes.

- [ ] **Step 5: Run full storage suite and commit**

Run: `pnpm test -- tests/storage tests/integration/storage-commands.test.ts && pnpm check`

```bash
git add src/commands src/domain/approval-token.ts src/cli.ts tests/integration/storage-commands.test.ts
git commit -m "feat: gate storage provisioning by approved plan"
```

## Plan 3 completion gate

Run:

```bash
pnpm test -- tests/storage tests/integration/storage-commands.test.ts
pnpm check
pnpm loopstack storage plan --provider convex --config tests/fixtures/storage/convex.yaml --out .tmp/convex-plan.json
pnpm loopstack storage plan --provider airtable --config tests/fixtures/storage/airtable.yaml --out .tmp/airtable-plan.json
pnpm loopstack storage plan --provider google-sheets --config tests/fixtures/storage/google-sheets.yaml --out .tmp/sheets-plan.json
git status --short
```

Expected: all adapter contracts pass and all three non-mutating plans are generated.
