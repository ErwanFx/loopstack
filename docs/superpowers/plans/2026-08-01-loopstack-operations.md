# Loopstack QA and Operations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete Loopstack with implementation, QA, deployment, monitoring, registry, alerts, controlled modification, and a separate Business Loops repository validated by an SEO shadow run.

**Architecture:** A deterministic QA runner executes layered gates and emits an activation verdict. An operations service reads the Git registry plus runtime storage, while alert and watchdog components monitor failures independently from the primary agent execution. Business loops are generated into a sibling repository from versioned templates.

**Tech Stack:** TypeScript, Vitest, Git, Hermes and Claude runtime adapters, native storage blueprints and evidence gates, YAML/JSON fixtures.

## Global Constraints

- Blocking QA failures prevent deployment.
- New loops progress through shadow, draft/approval, canary, then active.
- The first end-to-end fixture never publishes or sends external messages.
- Alerts include resume guidance and duplicate-action risk.
- Running executions remain pinned to their starting loop version.
- Business loop modification always creates a semantic diff, plan, approval, new version, and fresh QA verdict.
- No web dashboard is built in the MVP.

---

## File map

```text
src/qa/types.ts                            QA result types
src/qa/runner.ts                           Ordered QA gates
src/qa/gates/*                             Static, connection, contract, scenario, shadow, canary gates
src/operations/registry.ts                 Git and runtime registry merger
src/operations/alerts.ts                   Alert routing
src/operations/watchdog.ts                 Heartbeat monitor
src/operations/versioning.ts               Semantic loop diffs and version pins
src/commands/qa.ts                          QA CLI
src/commands/list.ts                        Loop list CLI
src/commands/show.ts                        Loop inspection CLI
src/commands/monitor.ts                     Health CLI
skills/loop-implement/SKILL.md              Approved implementation
skills/loop-qa/SKILL.md                     QA workflow
skills/loop-deploy/SKILL.md                 Progressive activation
skills/loop-monitor/SKILL.md                Operations workflow
skills/loop-list/SKILL.md                   Registry workflow
skills/loop-show/SKILL.md                   Detail workflow
skills/loop-modify/SKILL.md                 Controlled modifications
skills/loop-debug/SKILL.md                  Investigation workflow
skills/loop-improve/SKILL.md                Improvement workflow
templates/business-loops/*                  Separate repository template
tests/qa/*                                  QA tests
tests/operations/*                          Registry and alert tests
tests/e2e/seo-shadow.test.ts                End-to-end fixture
```

### Task 1: Implement the layered QA runner and activation verdict

**Files:**
- Create: `src/qa/types.ts`
- Create: `src/qa/runner.ts`
- Create: `src/qa/gates/static.ts`
- Create: `src/qa/gates/connections.ts`
- Create: `src/qa/gates/storage-contract.ts`
- Create: `src/qa/gates/scenarios.ts`
- Create: `src/qa/gates/approvals.ts`
- Create: `src/qa/gates/idempotency.ts`
- Create: `src/qa/gates/alerts.ts`
- Create: `tests/qa/runner.test.ts`

**Interfaces:**
- Produces: `runQa(input): Promise<QaReport>` and `QaVerdict = "pass" | "blocked"`.

- [ ] **Step 1: Write the failing runner tests**

```ts
it("blocks activation when one mandatory gate fails", async () => {
  const report = await runQa(fixtureWith({ idempotency: "fail" }));
  expect(report.verdict).toBe("blocked");
  expect(report.blockers[0].code).toBe("DUPLICATE_SIDE_EFFECT_RISK");
});

it("does not run canary after a static blocker", async () => {
  const report = await runQa(fixtureWith({ manifest: "invalid" }));
  expect(report.gates.find((gate) => gate.name === "canary")).toBeUndefined();
});
```

- [ ] **Step 2: Verify failure**

Run: `pnpm test -- tests/qa/runner.test.ts`

Expected: FAIL because QA modules are absent.

- [ ] **Step 3: Implement ordered gates**

Each gate returns:

```ts
type QaGateResult = {
  name: string;
  status: "pass" | "fail" | "skip";
  blocking: boolean;
  durationMs: number;
  findings: QaFinding[];
  evidence: string[];
};
```

Stop before side-effecting gates when an earlier mandatory gate fails. Produce stable JSON and Markdown reports.

- [ ] **Step 4: Run and commit**

Run: `pnpm test -- tests/qa/runner.test.ts`

```bash
git add src/qa tests/qa/runner.test.ts
git commit -m "feat: add blocking loop QA pipeline"
```

### Task 2: Add failure-injection scenario tests

**Files:**
- Create: `tests/qa/scenarios.test.ts`
- Create: `tests/fixtures/scenarios/nominal.yaml`
- Create: `tests/fixtures/scenarios/missing-data.yaml`
- Create: `tests/fixtures/scenarios/low-confidence.yaml`
- Create: `tests/fixtures/scenarios/rejected-approval.yaml`
- Create: `tests/fixtures/scenarios/duplicate-webhook.yaml`
- Create: `tests/fixtures/scenarios/tool-timeout.yaml`
- Create: `tests/fixtures/scenarios/budget-exhausted.yaml`
- Create: `tests/fixtures/scenarios/agent-interrupted.yaml`

**Interfaces:**
- Consumes: `runQa`, fake runtime and storage adapters.
- Produces: required regression scenarios from the design spec.

- [ ] **Step 1: Write the scenario matrix test**

```ts
const expected = {
  nominal: "pass",
  "missing-data": "blocked",
  "low-confidence": "approval-required",
  "rejected-approval": "stopped",
  "duplicate-webhook": "deduplicated",
  "tool-timeout": "alerted",
  "budget-exhausted": "stopped",
  "agent-interrupted": "resumable"
};
```

Load every fixture and assert its expected terminal behavior, alert code, and absence of duplicate actions.

- [ ] **Step 2: Verify failure**

Run: `pnpm test -- tests/qa/scenarios.test.ts`

Expected: FAIL until the fixtures and scenario executor exist.

- [ ] **Step 3: Implement fixture executor and missing QA gates**

Use deterministic fake model responses and fake provider failures. A timeout after an ambiguous side effect must mark the action `unknown`, prevent automatic retry, and require reconciliation.

- [ ] **Step 4: Run and commit**

Run: `pnpm test -- tests/qa/scenarios.test.ts`

```bash
git add tests/qa/scenarios.test.ts tests/fixtures/scenarios src/qa
git commit -m "test: cover loop failure scenarios"
```

### Task 3: Create implementation, QA, deployment, and operations skills

**Files:**
- Create: `skills/loop-implement/SKILL.md`
- Create: `skills/loop-qa/SKILL.md`
- Create: `skills/loop-deploy/SKILL.md`
- Create: `skills/loop-monitor/SKILL.md`
- Create: `skills/loop-list/SKILL.md`
- Create: `skills/loop-show/SKILL.md`
- Create: `skills/loop-modify/SKILL.md`
- Create: `skills/loop-debug/SKILL.md`
- Create: `skills/loop-improve/SKILL.md`
- Create: `tests/skills/operations-skills.test.ts`

**Interfaces:**
- Consumes: plan approval hash, runtime/storage commands, QA report, lifecycle graph.
- Produces: remaining user-facing routed skills.

- [ ] **Step 1: Write failing skill tests**

Assert all skill folders exist, pass frontmatter validation, name their permitted next skill, and include their mandatory gate. Specific assertions:

- `loop-implement` requires matching plan hash;
- `loop-qa` cannot claim success without machine-readable report;
- `loop-deploy` requires `pass` verdict and begins with shadow;
- `loop-modify` emits semantic diff and routes to `loop-plan`;
- `loop-debug` investigates before modification;
- `loop-improve` cannot silently change structural rules.

- [ ] **Step 2: Verify failure**

Run: `pnpm test -- tests/skills/operations-skills.test.ts`

Expected: FAIL with missing skills.

- [ ] **Step 3: Write focused skills and references**

Keep fragile commands in scripts/CLI. Each skill documents its inputs, stop gates, generated artifact, and handoff. Add references only where the procedure exceeds the 500-line skill limit.

- [ ] **Step 4: Validate and commit**

Run:

```bash
for skill in skills/*; do python3 "$CODEX_SKILLS_DIR/skill-creator/scripts/quick_validate.py" "$skill"; done
pnpm test -- tests/skills/operations-skills.test.ts
```

```bash
git add skills tests/skills/operations-skills.test.ts
git commit -m "feat: add loop operations skills"
```

### Task 4: Implement registry, list, show, and lifecycle administration

**Files:**
- Create: `src/operations/registry.ts`
- Create: `src/commands/list.ts`
- Create: `src/commands/show.ts`
- Create: `src/commands/lifecycle.ts`
- Create: `tests/operations/registry.test.ts`
- Modify: `src/cli.ts`

**Interfaces:**
- Produces: `buildRegistry(git, storage): Promise<LoopRegistry>`, list/show/pause/resume/archive commands.

- [ ] **Step 1: Write failing registry merge tests**

Create Git fixtures for active, building, archived, and deleted definitions plus runtime fixtures for healthy, stale, degraded, and failed runs. Assert runtime health does not overwrite Git lifecycle metadata and that unknown runtime loops are marked `unregistered`.

- [ ] **Step 2: Verify failure**

Run: `pnpm test -- tests/operations/registry.test.ts`

Expected: FAIL because registry code is absent.

- [ ] **Step 3: Implement normalized summaries**

Return:

```ts
type OperationalLoopSummary = {
  id: string;
  name: string;
  status: LoopStatus;
  runtime: "hermes" | "claude-code";
  storage: "convex" | "airtable" | "google-sheets";
  version: number;
  health: "healthy" | "stale" | "degraded" | "failed" | "unknown";
  lastRunAt: string | null;
  openAlerts: number;
  pendingApprovals: number;
  targetMetric: string;
  latestGap: number | null;
};
```

Pause/resume/archive commands generate a plan and require approval; they do not mutate directly.

- [ ] **Step 4: Run CLI snapshot tests and commit**

Run: `pnpm test -- tests/operations/registry.test.ts`

```bash
git add src/operations/registry.ts src/commands src/cli.ts tests/operations/registry.test.ts
git commit -m "feat: add loop registry operations"
```

### Task 5: Implement alerts, watchdog, and resumable recovery

**Files:**
- Create: `src/operations/alerts.ts`
- Create: `src/operations/watchdog.ts`
- Create: `src/operations/recovery.ts`
- Create: `tests/operations/alerts.test.ts`
- Create: `tests/operations/watchdog.test.ts`

**Interfaces:**
- Produces: `formatAlert`, `dispatchAlert`, `findStaleRuns`, `buildRecoveryPlan`.

- [ ] **Step 1: Write failing alert and heartbeat tests**

Assert that every alert includes loop/run IDs, failed step, completed actions, duplicate risk, retry history, recommended action, and resume command. Assert stale heartbeats generate alerts even if the agent never recorded a terminal failure.

- [ ] **Step 2: Verify failure**

Run: `pnpm test -- tests/operations/alerts.test.ts tests/operations/watchdog.test.ts`

Expected: FAIL because operations modules are absent.

- [ ] **Step 3: Implement provider-neutral alert envelopes**

Map alerts to runtime delivery adapters. Delivery failure records a secondary `ALERT_DELIVERY_FAILED` incident and writes a local fallback log. Recovery plans classify actions as safe-to-retry, reconcile-first, or human-only using action idempotency and terminal state.

- [ ] **Step 4: Run and commit**

Run: `pnpm test -- tests/operations/alerts.test.ts tests/operations/watchdog.test.ts`

```bash
git add src/operations tests/operations
git commit -m "feat: add loop alerts and recovery watchdog"
```

### Task 6: Implement semantic loop modification and version pinning

**Files:**
- Create: `src/operations/versioning.ts`
- Create: `src/operations/semantic-diff.ts`
- Create: `tests/operations/versioning.test.ts`

**Interfaces:**
- Produces: `diffLoopVersions(before, after)`, `classifyChange(diff)`, `pinRunVersion(run, version)`.

- [ ] **Step 1: Write failing versioning tests**

Test process-step addition, approval removal, threshold change, storage migration, and alert-channel change. Approval removal and permission expansion must classify as `high-risk-structural`. Running version 3 remains pinned when version 4 activates.

- [ ] **Step 2: Verify failure**

Run: `pnpm test -- tests/operations/versioning.test.ts`

Expected: FAIL because versioning code is absent.

- [ ] **Step 3: Implement semantic paths and migration impact**

Return changed paths, old/new values, risk, required tests, storage migration requirement, and whether a new approval is mandatory. Reject direct edits to generated runtime wrappers when canonical YAML did not change.

- [ ] **Step 4: Run and commit**

Run: `pnpm test -- tests/operations/versioning.test.ts`

```bash
git add src/operations/versioning.ts src/operations/semantic-diff.ts tests/operations/versioning.test.ts
git commit -m "feat: add controlled loop versioning"
```

### Task 7: Generate the separate Business Loops repository template

**Files:**
- Create: `templates/business-loops/registry.yaml`
- Create: `templates/business-loops/loops/.gitkeep`
- Create: `templates/business-loops/generated/.gitkeep`
- Create: `templates/business-loops/tests/.gitkeep`
- Create: `templates/business-loops/.gitignore`
- Create: `src/commands/init-business-repo.ts`
- Create: `tests/integration/business-repo.test.ts`
- Modify: `src/cli.ts`

**Interfaces:**
- Produces: `loopstack init-business-repo <path>`.

- [ ] **Step 1: Write the failing repository-generation test**

Generate into a temporary directory and assert repository layout, schema version, clean secret policy, valid registry, and refusal to overwrite a non-empty target without `--force` plus approved plan coverage.

- [ ] **Step 2: Verify failure**

Run: `pnpm test -- tests/integration/business-repo.test.ts`

Expected: FAIL because the generator is missing.

- [ ] **Step 3: Implement deterministic copy and validation**

The command copies only allowlisted template files, initializes Git only when `--git` is provided, and prints the created files. It never creates live connections or triggers.

- [ ] **Step 4: Run and commit**

Run: `pnpm test -- tests/integration/business-repo.test.ts`

```bash
git add templates/business-loops src/commands/init-business-repo.ts src/cli.ts tests/integration/business-repo.test.ts
git commit -m "feat: add business loops repository template"
```

- [ ] **Step 5: Instantiate and version the separate repository**

After the generator test passes, create the approved sibling repository:

```bash
pnpm loopstack init-business-repo \
  '../business-loops' --git
git -C '../business-loops' add .
git -C '../business-loops' commit \
  -m 'chore: initialize business loops repository'
```

Expected: the sibling repository has a valid registry, no credentials, and a clean worktree.

### Task 8: Add the SEO shadow loop end-to-end fixture

**Files:**
- Create: `tests/fixtures/business-loops/loops/seo-growth/loop.yaml`
- Create: `tests/fixtures/business-loops/loops/seo-growth/process.yaml`
- Create: `tests/fixtures/business-loops/loops/seo-growth/skills.yaml`
- Create: `tests/fixtures/business-loops/loops/seo-growth/tools.yaml`
- Create: `tests/fixtures/business-loops/loops/seo-growth/storage.yaml`
- Create: `tests/fixtures/business-loops/loops/seo-growth/approvals.yaml`
- Create: `tests/fixtures/business-loops/loops/seo-growth/alerts.yaml`
- Create: `tests/fixtures/business-loops/loops/seo-growth/evaluations.yaml`
- Create: `tests/fixtures/business-loops/loops/seo-growth/tests.yaml`
- Create: `tests/e2e/seo-shadow.test.ts`

**Interfaces:**
- Consumes: core, runtimes, memory storage, QA, registry, alerts.
- Produces: complete non-production acceptance flow.

- [ ] **Step 1: Write the failing end-to-end test**

The test must:

1. validate and qualify the fixture;
2. pass Eric review;
3. render Hermes and Claude packages;
4. authorize the native memory provisioning plan and verify simulated redacted evidence;
5. execute a shadow observation and simulated decision;
6. record evidence, decision, simulated action result, evaluation, and learning;
7. measure configured 7/14/30-day follow-ups as scheduled events;
8. run QA;
9. list the loop as `shadow` and healthy;
10. inject a tool timeout and verify alert/recovery behavior without duplicate action.

- [ ] **Step 2: Verify failure**

Run: `pnpm test -- tests/e2e/seo-shadow.test.ts`

Expected: FAIL until the fixture and complete integration exist.

- [ ] **Step 3: Implement fixture and only the missing glue**

Use fake OpenSEO and CMS tools. The CMS action must be `simulate_draft`; assert no external network calls occur. Keep the business objective `qualified_leads`, not article count.

- [ ] **Step 4: Run the complete suite**

Run:

```bash
pnpm test -- tests/e2e/seo-shadow.test.ts
pnpm check
for skill in skills/*; do python3 "$CODEX_SKILLS_DIR/skill-creator/scripts/quick_validate.py" "$skill"; done
python3 "$CODEX_SKILLS_DIR/plugin-creator/scripts/validate_plugin.py" .
```

Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add tests/fixtures/business-loops tests/e2e/seo-shadow.test.ts
git commit -m "test: validate SEO loop shadow lifecycle"
```

## Plan 4 completion gate

Run:

```bash
pnpm check
pnpm build
pnpm test -- tests/e2e/seo-shadow.test.ts
for skill in skills/*; do python3 "$CODEX_SKILLS_DIR/skill-creator/scripts/quick_validate.py" "$skill"; done
python3 "$CODEX_SKILLS_DIR/plugin-creator/scripts/validate_plugin.py" .
git diff --check
git status --short
```

Expected: all tests and validators pass, the SEO fixture remains non-production, and the worktree is clean.
