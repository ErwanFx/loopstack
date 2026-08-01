# Loopstack Runtime Adapters Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Package and operate the same Loopstack workflow safely on Hermes Agent and Claude Code.

**Architecture:** A host-neutral runtime contract describes capabilities, triggers, skill loading, approvals, delivery, and health. Hermes and Claude Code adapters render runtime-specific configuration and wrappers without changing business loop semantics.

**Tech Stack:** TypeScript, Vitest, YAML, Hermes Agent CLI/configuration, Claude Code plugin/skills.

## Global Constraints

- Core domain artifacts from Plan 1 remain the source of truth.
- Runtime wrappers must never add permissions absent from the approved plan.
- Missing runtime capabilities must fail preflight instead of silently degrading.
- Rendered files must be deterministic and contain no credentials.
- Hermes and Claude Code packages must produce equivalent handoff and approval behavior.

---

## File map

```text
src/runtimes/types.ts                    Runtime contract
src/runtimes/registry.ts                 Runtime selection
src/runtimes/hermes.ts                   Hermes rendering and preflight
src/runtimes/claude-code.ts              Claude Code rendering and preflight
src/commands/runtime-preflight.ts        CLI preflight command
src/commands/runtime-render.ts           CLI render command
templates/runtimes/hermes/*              Hermes configuration templates
templates/runtimes/claude-code/*         Claude Code configuration templates
tests/runtimes/*.test.ts                 Contract tests
tests/golden/runtimes/*                  Expected rendered packages
```

### Task 1: Define the runtime capability contract

**Files:**
- Create: `src/runtimes/types.ts`
- Create: `src/runtimes/registry.ts`
- Create: `tests/runtimes/contract.test.ts`

**Interfaces:**
- Consumes: `LoopDefinition`, `Handoff`.
- Produces: `RuntimeAdapter`, `RuntimePreflight`, `RenderedRuntimePackage`, `getRuntimeAdapter(name)`.

- [ ] **Step 1: Write the failing contract test**

```ts
import { describe, expect, it } from "vitest";
import { runtimeNames } from "../../src/runtimes/types.js";

it("ships Hermes and Claude Code adapters", () => {
  expect(runtimeNames).toEqual(["hermes", "claude-code"]);
});
```

Define the required interface in the test fixture:

```ts
export interface RuntimeAdapter {
  readonly name: "hermes" | "claude-code";
  preflight(input: RuntimePreflightInput): Promise<RuntimePreflight>;
  render(input: RuntimeRenderInput): Promise<RenderedRuntimePackage>;
  validate(packagePath: string): Promise<RuntimeValidation>;
}
```

- [ ] **Step 2: Run and verify failure**

Run: `pnpm test -- tests/runtimes/contract.test.ts`

Expected: FAIL because runtime types are absent.

- [ ] **Step 3: Implement types and registry**

`RuntimePreflight` must report CLI presence, authenticated profile, skills directory, trigger support, approval support, delivery target status, and blockers. `getRuntimeAdapter` throws on unknown runtime names.

- [ ] **Step 4: Run and commit**

Run: `pnpm test -- tests/runtimes/contract.test.ts`

```bash
git add src/runtimes/types.ts src/runtimes/registry.ts tests/runtimes/contract.test.ts
git commit -m "feat: define runtime adapter contract"
```

### Task 2: Implement Hermes rendering and preflight

**Files:**
- Create: `src/runtimes/hermes.ts`
- Create: `templates/runtimes/hermes/webhook-route.yaml`
- Create: `templates/runtimes/hermes/cron-job.yaml`
- Create: `templates/runtimes/hermes/skill-wrapper.md`
- Create: `tests/runtimes/hermes.test.ts`
- Create: `tests/golden/runtimes/hermes/seo-growth.yaml`

**Interfaces:**
- Produces: `HermesRuntimeAdapter` implementing `RuntimeAdapter`.

- [ ] **Step 1: Write failing Hermes tests**

Test that manual, webhook, and schedule triggers render separately; webhook routes include an HMAC secret reference and explicit skill list; schedules start disabled; delivery defaults to `log`; no rendered file includes values matching `/token|secret|api[_-]?key/i` except environment-variable names.

```ts
expect(rendered.triggers[0].enabled).toBe(false);
expect(rendered.webhook.skills).toContain("seo-growth-loop");
expect(rendered.webhook.secretEnv).toBe("LOOPSTACK_SEO_GROWTH_WEBHOOK_SECRET");
```

- [ ] **Step 2: Verify failure**

Run: `pnpm test -- tests/runtimes/hermes.test.ts`

Expected: FAIL because `HermesRuntimeAdapter` does not exist.

- [ ] **Step 3: Implement deterministic rendering**

Map triggers to Hermes cron or webhook configuration. Include delivery target, skills, work directory, loop/run identifiers, idempotency header mapping, and disabled-by-default activation. Use environment-variable references for secrets.

- [ ] **Step 4: Implement safe preflight**

Use an injectable command runner. Check `hermes --help`, configured profile, gateway health, required installed skills, webhook health when needed, and alert delivery configuration. Tests use a fake runner; no live Hermes mutation occurs.

- [ ] **Step 5: Golden-test rendering and commit**

Run: `pnpm test -- tests/runtimes/hermes.test.ts -u && pnpm test -- tests/runtimes/hermes.test.ts`

```bash
git add src/runtimes/hermes.ts templates/runtimes/hermes tests/runtimes/hermes.test.ts tests/golden/runtimes/hermes
git commit -m "feat: add Hermes runtime adapter"
```

### Task 3: Implement Claude Code rendering and preflight

**Files:**
- Create: `src/runtimes/claude-code.ts`
- Create: `templates/runtimes/claude-code/plugin.json`
- Create: `.claude-plugin/plugin.json`
- Create: `templates/runtimes/claude-code/skill-wrapper.md`
- Create: `templates/runtimes/claude-code/permissions.json`
- Create: `tests/runtimes/claude-code.test.ts`
- Create: `tests/golden/runtimes/claude-code/seo-growth.json`

**Interfaces:**
- Produces: `ClaudeCodeRuntimeAdapter` implementing `RuntimeAdapter`.

- [ ] **Step 1: Write failing Claude Code tests**

Assert that rendered skills preserve the same route names, approval stop, and manifest version as Hermes. Assert that permissions include only tools declared in `tools.yaml`, and that unsupported native cron/webhook triggers become explicit external-trigger requirements rather than being omitted.

- [ ] **Step 2: Verify failure**

Run: `pnpm test -- tests/runtimes/claude-code.test.ts`

Expected: FAIL because the adapter is missing.

- [ ] **Step 3: Implement rendering and capability reporting**

Render Claude Code skill/plugin metadata, runtime instructions, allowed tools, approval language, and external trigger contract. Add the repository-level `.claude-plugin/plugin.json` so Loopstack itself installs as a Claude Code plugin. Preflight checks CLI presence, project settings, skill discovery, and required MCP/tool availability through an injectable runner.

- [ ] **Step 4: Golden-test and commit**

Run: `pnpm test -- tests/runtimes/claude-code.test.ts -u && pnpm test -- tests/runtimes/claude-code.test.ts`

```bash
git add .claude-plugin src/runtimes/claude-code.ts templates/runtimes/claude-code tests/runtimes/claude-code.test.ts tests/golden/runtimes/claude-code
git commit -m "feat: add Claude Code runtime adapter"
```

### Task 4: Add runtime CLI commands and cross-runtime equivalence tests

**Files:**
- Create: `src/commands/runtime-preflight.ts`
- Create: `src/commands/runtime-render.ts`
- Create: `tests/integration/runtime-equivalence.test.ts`
- Modify: `src/cli.ts`

**Interfaces:**
- Produces: `loopstack runtime preflight` and `loopstack runtime render` commands.

- [ ] **Step 1: Write the failing equivalence test**

Render the SEO fixture for both runtimes and compare normalized values:

```ts
expect(normalize(hermes)).toEqual(normalize(claude));
```

`normalize` must retain loop ID, version, skills, triggers, approval requirements, alert policy, target, and measurement windows while removing host-only paths and syntax.

- [ ] **Step 2: Verify failure**

Run: `pnpm test -- tests/integration/runtime-equivalence.test.ts`

Expected: FAIL because commands and normalization are absent.

- [ ] **Step 3: Implement commands**

Examples:

```bash
pnpm loopstack runtime preflight --runtime hermes --loop tests/fixtures/processes/seo-valid.yaml
pnpm loopstack runtime render --runtime claude-code --loop tests/fixtures/processes/seo-valid.yaml --out .tmp/claude-seo
```

Preflight exits 2 on blockers. Render refuses to run unless core validation passes and always writes disabled triggers.

- [ ] **Step 4: Run full runtime suite and commit**

Run: `pnpm test -- tests/runtimes tests/integration/runtime-equivalence.test.ts && pnpm check`

```bash
git add src/commands src/cli.ts tests/integration/runtime-equivalence.test.ts
git commit -m "feat: add portable runtime packaging"
```

## Plan 2 completion gate

Run:

```bash
pnpm check
rm -rf .tmp/runtime-gate
pnpm loopstack runtime render --runtime hermes --loop tests/fixtures/processes/seo-valid.yaml --out .tmp/runtime-gate/hermes
pnpm loopstack runtime render --runtime claude-code --loop tests/fixtures/processes/seo-valid.yaml --out .tmp/runtime-gate/claude
pnpm test -- tests/integration/runtime-equivalence.test.ts
git status --short
```

Expected: both packages render, equivalence passes, and only ignored `.tmp` files remain.
