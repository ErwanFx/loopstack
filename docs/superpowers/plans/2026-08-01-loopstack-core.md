# Loopstack Core Plugin Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a valid Loopstack plugin whose host-neutral skills can interview, qualify, design, review, and plan an AI Loop while enforcing lifecycle order and approval boundaries.

**Architecture:** TypeScript implements deterministic schemas, state transitions, handoffs, and validation. Small `SKILL.md` files provide the agent behavior and call the deterministic CLI for gates. Declarative YAML artifacts are the source of truth.

**Tech Stack:** Node.js 22, pnpm 10, TypeScript, Vitest, Zod, `yaml`, Codex plugin manifest, standard `SKILL.md` files.

## Global Constraints

- Do not add runtime-specific API calls in the core package.
- Do not perform external mutations from core skills.
- Keep every skill under 500 lines and move detailed criteria to `references/`.
- Every workflow skill emits a validated handoff.
- `loop-plan` always stops for explicit approval.
- Use lowercase hyphenated skill and loop identifiers.

---

## File map

```text
.codex-plugin/plugin.json                 Plugin identity
package.json                              Scripts and dependencies
tsconfig.json                             Strict TypeScript configuration
vitest.config.ts                          Test configuration
src/domain/types.ts                       Canonical domain types
src/domain/schemas.ts                     Zod schemas
src/domain/lifecycle.ts                   Allowed state transitions
src/domain/readiness.ts                   Hard readiness gate
src/domain/handoff.ts                     Handoff creation and validation
src/cli.ts                                Deterministic command entrypoint
src/commands/validate.ts                  Manifest and artifact validation
src/commands/transition.ts                State transition command
src/commands/readiness.ts                 Readiness report command
schemas/*.schema.json                     Exported JSON schemas
skills/*/SKILL.md                         User-facing workflow skills
skills/*/references/*.md                  Detailed question and review rubrics
tests/domain/*.test.ts                    Unit tests
tests/skills/*.test.ts                    Skill structure and routing tests
```

### Task 1: Scaffold the validated plugin and TypeScript test harness

**Files:**
- Create: `.codex-plugin/plugin.json`
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `vitest.config.ts`
- Create: `src/cli.ts`
- Create: `tests/smoke/plugin.test.ts`

**Interfaces:**
- Produces: executable `pnpm loopstack`, `pnpm test`, and a plugin accepted by `validate_plugin.py`.

- [ ] **Step 1: Generate the canonical plugin skeleton in a temporary directory**

Run:

```bash
tmp_dir="$(mktemp -d)"
python3 "$CODEX_SKILLS_DIR/plugin-creator/scripts/create_basic_plugin.py" \
  loopstack --path "$tmp_dir" --with-skills --with-scripts --with-assets
python3 "$CODEX_SKILLS_DIR/plugin-creator/scripts/validate_plugin.py" \
  "$tmp_dir/loopstack"
```

Expected: validation succeeds. Use the generated manifest shape when adding the repository files with `apply_patch`.

- [ ] **Step 2: Write the failing smoke test**

```ts
// tests/smoke/plugin.test.ts
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("plugin manifest", () => {
  it("matches the repository name and exposes skills", () => {
    const manifest = JSON.parse(readFileSync(".codex-plugin/plugin.json", "utf8"));
    expect(manifest.name).toBe("loopstack");
    expect(manifest.skills).toBe("./skills/");
  });
});
```

- [ ] **Step 3: Run the test and verify the harness is absent**

Run: `pnpm test -- tests/smoke/plugin.test.ts`

Expected: FAIL because `package.json`, Vitest, or the plugin manifest is missing.

- [ ] **Step 4: Add the minimal toolchain and CLI**

Use these scripts in `package.json`:

```json
{
  "name": "loopstack",
  "private": true,
  "type": "module",
  "bin": { "loopstack": "dist/cli.js" },
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "test": "vitest run",
    "check": "tsc --noEmit && vitest run",
    "loopstack": "tsx src/cli.ts"
  }
}
```

Install: `pnpm add zod yaml && pnpm add -D typescript tsx vitest @types/node`

Use strict ES2022 NodeNext settings in `tsconfig.json`. Implement `src/cli.ts` so `pnpm loopstack --help` prints the commands `validate`, `transition`, and `readiness` and exits zero.

- [ ] **Step 5: Run validation**

Run:

```bash
pnpm test -- tests/smoke/plugin.test.ts
pnpm build
python3 "$CODEX_SKILLS_DIR/plugin-creator/scripts/validate_plugin.py" .
```

Expected: all three commands succeed.

- [ ] **Step 6: Commit**

```bash
git add .codex-plugin package.json pnpm-lock.yaml tsconfig.json vitest.config.ts src/cli.ts tests/smoke/plugin.test.ts
git commit -m "chore: scaffold loopstack plugin"
```

### Task 2: Define canonical loop schemas and identifiers

**Files:**
- Create: `src/domain/types.ts`
- Create: `src/domain/schemas.ts`
- Create: `src/domain/ids.ts`
- Create: `tests/domain/schemas.test.ts`
- Create: `scripts/export-schemas.ts`
- Create: `schemas/loop.schema.json`
- Create: `schemas/handoff.schema.json`

**Interfaces:**
- Produces: `LoopDefinition`, `LoopStatus`, `Handoff`, `ApprovalPolicy`, `assertLoopId(value)`, and exported JSON schemas.

- [ ] **Step 1: Write failing schema tests**

```ts
import { describe, expect, it } from "vitest";
import { LoopDefinitionSchema } from "../../src/domain/schemas.js";

const valid = {
  id: "seo-growth",
  name: "SEO Growth",
  version: 1,
  status: "designing",
  target: { metric: "qualified_leads", desired: 40, horizonDays: 90 },
  current: { value: 12, observedAt: "2026-08-01T00:00:00.000Z" },
  triggers: [{ type: "manual" }],
  feedback: [{ metric: "qualified_leads", delayDays: 30 }]
};

it("accepts a minimal measurable loop", () => {
  expect(LoopDefinitionSchema.parse(valid).id).toBe("seo-growth");
});

it("rejects an invalid loop identifier", () => {
  expect(() => LoopDefinitionSchema.parse({ ...valid, id: "SEO Growth" })).toThrow();
});
```

- [ ] **Step 2: Verify failure**

Run: `pnpm test -- tests/domain/schemas.test.ts`

Expected: FAIL because the schema module does not exist.

- [ ] **Step 3: Implement domain schemas**

Define the exact status union:

```ts
export const loopStatuses = [
  "idea", "qualifying", "blocked", "designing", "planned",
  "awaiting-approval", "building", "qa-failed", "ready", "shadow",
  "canary", "active", "paused", "degraded", "failed", "inactive", "archived"
] as const;
```

Require stable lowercase IDs, positive integer versions, ISO timestamps, target/current measurements, at least one trigger, and at least one feedback definition. Export inferred TypeScript types from the Zod schemas.

- [ ] **Step 4: Export JSON schemas deterministically**

Add `scripts/export-schemas.ts` using Zod's JSON Schema export and write sorted JSON with a trailing newline. Add `schema:export` to `package.json` and generate both files in `schemas/`.

- [ ] **Step 5: Run tests and schema export twice**

Run:

```bash
pnpm test -- tests/domain/schemas.test.ts
pnpm schema:export
git diff --exit-code schemas || true
pnpm schema:export
git diff --exit-code schemas
```

Expected: tests pass and the second export produces no diff.

- [ ] **Step 6: Commit**

```bash
git add src/domain tests/domain scripts/export-schemas.ts schemas package.json pnpm-lock.yaml
git commit -m "feat: define loop domain schemas"
```

### Task 3: Enforce lifecycle transitions and handoffs

**Files:**
- Create: `src/domain/lifecycle.ts`
- Create: `src/domain/handoff.ts`
- Create: `src/commands/transition.ts`
- Create: `tests/domain/lifecycle.test.ts`
- Create: `tests/domain/handoff.test.ts`

**Interfaces:**
- Consumes: `LoopStatus`, `HandoffSchema`.
- Produces: `canTransition(from, to): boolean`, `transition(loop, to): LoopDefinition`, `createHandoff(input): Handoff`.

- [ ] **Step 1: Write failing transition tests**

```ts
it("allows QA success to become ready", () => {
  expect(canTransition("building", "ready")).toBe(true);
});

it("forbids deploying a designing loop", () => {
  expect(canTransition("designing", "active")).toBe(false);
});

it("forces failed QA through qa-failed", () => {
  expect(canTransition("building", "qa-failed")).toBe(true);
  expect(canTransition("qa-failed", "active")).toBe(false);
});
```

Add a handoff test that rejects `next_skill: loop-deploy` from `completed_skill: loop-design`.

- [ ] **Step 2: Verify failure**

Run: `pnpm test -- tests/domain/lifecycle.test.ts tests/domain/handoff.test.ts`

Expected: FAIL because lifecycle functions are missing.

- [ ] **Step 3: Implement the transition graph**

Represent transitions as an exhaustive `Record<LoopStatus, readonly LoopStatus[]>`. Make `transition` throw `InvalidTransitionError` containing `from`, `to`, and allowed destinations. Validate skill handoffs against a second graph:

```ts
const skillRoute = {
  "loop-idea": ["loop-qualify"],
  "loop-qualify": ["loop-design"],
  "loop-design": ["loop-eric-review"],
  "loop-eric-review": ["loop-plan", "loop-design"],
  "loop-plan": ["loop-implement"],
  "loop-implement": ["loop-qa"],
  "loop-qa": ["loop-deploy", "loop-debug"],
  "loop-deploy": ["loop-monitor"],
  "loop-monitor": ["loop-improve", "loop-modify", "loop-debug"],
  "loop-modify": ["loop-plan"],
  "loop-debug": ["loop-plan"],
  "loop-improve": ["loop-plan"]
} as const;
```

- [ ] **Step 4: Add CLI transition output**

`pnpm loopstack transition --from designing --to active` must exit 2 and print JSON containing `INVALID_TRANSITION`. A valid transition exits zero and prints the new status.

- [ ] **Step 5: Run tests**

Run: `pnpm test -- tests/domain/lifecycle.test.ts tests/domain/handoff.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/domain/lifecycle.ts src/domain/handoff.ts src/commands/transition.ts tests/domain
git commit -m "feat: enforce loop lifecycle handoffs"
```

### Task 4: Implement the strict readiness gate

**Files:**
- Create: `src/domain/readiness.ts`
- Create: `src/commands/readiness.ts`
- Create: `tests/domain/readiness.test.ts`

**Interfaces:**
- Produces: `evaluateReadiness(input): ReadinessReport` with `status`, `score`, `blocking`, and `advisory` fields.

- [ ] **Step 1: Write failing hard-gate tests**

```ts
it("blocks a high-scoring proposal without measurable feedback", () => {
  const report = evaluateReadiness({ ...completeCandidate, feedback: [] });
  expect(report.status).toBe("blocked");
  expect(report.blocking).toContain("feedback_signal");
});

it("blocks a proposal without tested alert delivery", () => {
  const report = evaluateReadiness({ ...completeCandidate, alertConnection: "untested" });
  expect(report.blocking).toContain("tested_alert_channel");
});
```

- [ ] **Step 2: Verify failure**

Run: `pnpm test -- tests/domain/readiness.test.ts`

Expected: FAIL because `evaluateReadiness` is missing.

- [ ] **Step 3: Implement all 18 hard requirements**

Return `ready` only when the blocking list is empty. Calculate the advisory score from evidence quality, leverage, reversibility, data completeness, and measurement speed, but never use the score to bypass blockers.

- [ ] **Step 4: Add CLI JSON output**

`pnpm loopstack readiness path/to/loop.yaml` parses YAML, validates it, prints the report, and exits 2 when blocked.

- [ ] **Step 5: Run tests**

Run: `pnpm test -- tests/domain/readiness.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/domain/readiness.ts src/commands/readiness.ts tests/domain/readiness.test.ts
git commit -m "feat: add strict loop readiness gate"
```

### Task 5: Create and validate the routed core skills

**Files:**
- Create: `skills/using-loopstack/SKILL.md`
- Create: `skills/loop-idea/SKILL.md`
- Create: `skills/loop-idea/references/interview-rubric.md`
- Create: `skills/loop-qualify/SKILL.md`
- Create: `skills/loop-design/SKILL.md`
- Create: `skills/loop-eric-review/SKILL.md`
- Create: `skills/loop-eric-review/references/eric-siu-checklist.md`
- Create: `skills/loop-plan/SKILL.md`
- Create: `tests/skills/core-skills.test.ts`

**Interfaces:**
- Consumes: `pnpm loopstack readiness`, `pnpm loopstack transition`, handoff schema.
- Produces: host-neutral workflow skills with deterministic next-skill routing.

- [ ] **Step 1: Write failing skill structure tests**

The test enumerates the six required skill folders, parses YAML frontmatter, asserts lowercase names, descriptions under 1024 characters, body length below 500 lines, and an explicit `## Handoff` section naming the permitted next skill.

```ts
expect(frontmatter.name).toBe(directoryName);
expect(frontmatter.description.length).toBeLessThanOrEqual(1024);
expect(markdown).toContain("## Handoff");
```

- [ ] **Step 2: Verify failure**

Run: `pnpm test -- tests/skills/core-skills.test.ts`

Expected: FAIL with missing skill directories.

- [ ] **Step 3: Implement `loop-idea` behavior**

Require one adaptive question at a time. Incorporate Superpowers' context-first, alternatives, and approval discipline plus Office Hours' evidence, current workaround, specific owner, narrowest wedge, direct observation, and future-fit pressure. End only with a validated handoff to `loop-qualify`, a blocked evidence list, or a recommendation not to continue.

- [ ] **Step 4: Implement qualification, design, Eric review, and planning skills**

`loop-qualify` must emit one of the nine classifications in the spec. `loop-eric-review` must check target/current/gap, state/evidence/scoring/actions, human gates, follow-up measurement, learning, stop/escalate, connectors, and leverage. `loop-plan` must enumerate permitted mutations and end at an approval stop.

- [ ] **Step 5: Validate skills with both validators**

Run:

```bash
for skill in skills/*; do
  python3 "$CODEX_SKILLS_DIR/skill-creator/scripts/quick_validate.py" "$skill"
done
pnpm test -- tests/skills/core-skills.test.ts
```

Expected: every skill passes.

- [ ] **Step 6: Commit**

```bash
git add skills tests/skills
git commit -m "feat: add routed loop design skills"
```

### Task 6: Add fixture-driven core workflow verification

**Files:**
- Create: `tests/fixtures/processes/seo-valid.yaml`
- Create: `tests/fixtures/processes/invoice-deterministic.yaml`
- Create: `tests/fixtures/processes/unsafe-outreach.yaml`
- Create: `tests/integration/core-workflow.test.ts`
- Modify: `src/commands/validate.ts`
- Modify: `src/cli.ts`

**Interfaces:**
- Produces: `pnpm loopstack validate <path>` and deterministic core acceptance fixtures.

- [ ] **Step 1: Write failing fixture tests**

Assert that:

- `seo-valid.yaml` qualifies for design and passes readiness;
- `invoice-deterministic.yaml` is classified as deterministic automation;
- `unsafe-outreach.yaml` is blocked for missing approval, stop, and alert policies.

- [ ] **Step 2: Verify failure**

Run: `pnpm test -- tests/integration/core-workflow.test.ts`

Expected: FAIL because fixture validation is not wired.

- [ ] **Step 3: Implement validation command**

Parse YAML, run Zod schema validation, readiness evaluation, and lifecycle consistency checks. Print a stable JSON envelope:

```ts
type ValidationEnvelope = {
  valid: boolean;
  classification: string;
  readiness: ReadinessReport;
  errors: Array<{ code: string; path: string; message: string }>;
};
```

- [ ] **Step 4: Run the full core suite**

Run:

```bash
pnpm check
pnpm loopstack validate tests/fixtures/processes/seo-valid.yaml
python3 "$CODEX_SKILLS_DIR/plugin-creator/scripts/validate_plugin.py" .
```

Expected: all pass; validation output has `valid: true` for SEO.

- [ ] **Step 5: Commit**

```bash
git add src tests
git commit -m "test: verify core loop workflow"
```

## Plan 1 completion gate

Run:

```bash
pnpm check
pnpm build
for skill in skills/*; do python3 "$CODEX_SKILLS_DIR/skill-creator/scripts/quick_validate.py" "$skill"; done
python3 "$CODEX_SKILLS_DIR/plugin-creator/scripts/validate_plugin.py" .
git status --short
```

Expected: all checks pass and the worktree is clean.
