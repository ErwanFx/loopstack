# Loopstack 0.2.1 Portability and Installation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Loopstack installable and behaviorally portable across Codex, Claude Code, and Hermes while preserving auditable historical handoffs.

**Architecture:** Keep the seven consolidated public workflows, but replace Hermes-only design requirements with a runtime-neutral learning contract and runtime adapters. Separate structural handoff parsing from time-bound execution authorization. Add repository-root marketplace manifests, executable Hermes legacy registrations, automated distribution checks, public documentation, licensing, and CI.

**Tech Stack:** TypeScript 7, Zod 4, Vitest 4, Python 3 Hermes plugin adapter, Codex and Claude plugin manifests, GitHub Actions

## Global Constraints

- Preserve the seven public workflow names and all v1 persisted handoff fields.
- Fail closed before execution when approval evidence is expired, untrusted, mismatched, or missing.
- Keep historical handoffs structurally readable after their authorization expires.
- Keep Hermes as the primary runtime without requiring Hermes-only capabilities for Claude Code or Codex loops.
- Keep marketplace plugin sources at the repository root and verify them with real isolated CLI installs.
- Keep all public `SKILL.md` frontmatter limited to `name` and `description`.
- Version every runtime manifest and marketplace entry as `0.2.1`.

---

### Task 1: Validate portable public skills

**Files:**
- Create: `tests/skills/portability.test.ts`
- Create: `skills/loop-design/references/runtime-learning.md`
- Modify: `skills/using-loopstack/SKILL.md`
- Modify: `skills/loop-discover/SKILL.md`
- Modify: `skills/loop-design/SKILL.md`
- Modify: `skills/loop-plan/SKILL.md`
- Modify: `skills/loop-build/SKILL.md`
- Modify: `skills/loop-launch/SKILL.md`
- Modify: `skills/loop-operate/SKILL.md`
- Modify: `skills/loop-design/references/protocols/functional-design.md`
- Modify: `skills/loop-design/references/protocols/loop-storage-design/SKILL.md`

**Interfaces:**
- Consumes: `runtime: hermes | claude-code | codex` from the approved loop design.
- Produces: a runtime-neutral `Learn` contract with evidence, reusable procedure updates, durable facts, anti-noise thresholds, exclusions, and a runtime-specific implementation selected only after runtime choice.

- [ ] **Step 1: Write the failing portability test**

Assert that every public skill frontmatter has exactly `name` and `description`; that no public design instruction says Hermes learning is mandatory regardless of runtime; that `runtime-learning.md` defines Hermes, Claude Code, and Codex adapters; and that diagram generation has a self-contained HTML/SVG fallback when `architecture-diagram` is unavailable.

- [ ] **Step 2: Run the focused test and verify RED**

Run: `pnpm vitest run tests/skills/portability.test.ts`

Expected: FAIL because the public skills contain `version`, `author`, `license`, and `metadata`, the runtime-learning reference is absent, and the design protocol mandates Hermes capabilities.

- [ ] **Step 3: Implement the portable skill contract**

Remove non-trigger fields from the seven public skill frontmatters. Add `runtime-learning.md` with one common Learn contract and three adapters. Replace mandatory Hermes language with runtime selection, and make `architecture-diagram` preferred on Hermes but not required on other runtimes.

- [ ] **Step 4: Verify GREEN with both repository and official validators**

Run the focused Vitest file, then run `quick_validate.py` against every public skill. Both must exit zero.

- [ ] **Step 5: Commit the portable skills**

Commit: `fix: make loop design runtime portable`

---

### Task 2: Separate historical parsing from execution authorization

**Files:**
- Modify: `src/domain/handoff.ts`
- Modify: `tests/domain/handoff.test.ts`
- Modify: `tests/e2e/ecoi-consolidated-resume.test.ts`

**Interfaces:**
- `createHandoff(input): Handoff` validates schema, routes, scope, and artifact integrity without evaluating current time.
- `normalizeHandoff(input): CanonicalHandoff` remains safe for expired historical records.
- `assertGateAuthorization(handoff, gate, trust, now): void` validates trust plus approval freshness.
- `shouldAutoContinue(handoff, trust): boolean` remains fail-closed for expired evidence.

- [ ] **Step 1: Write failing historical-read tests**

Add tests proving that an expired but structurally valid v2 handoff can be created and normalized, while `assertGateAuthorization()` and `shouldAutoContinue()` reject it. Add the same authorization rejection for future-dated approvals.

- [ ] **Step 2: Run the focused tests and verify RED**

Run: `pnpm vitest run tests/domain/handoff.test.ts tests/e2e/ecoi-consolidated-resume.test.ts`

Expected: FAIL because `createHandoff()` currently rejects expired evidence during structural validation.

- [ ] **Step 3: Split structure and freshness checks**

Keep scope, attachment, and artifact-hash checks in structural validation. Move approval-time and expiry checks into a freshness function called only by `assertGateAuthorization()`.

- [ ] **Step 4: Verify GREEN**

Run the focused tests and confirm historical parsing succeeds while route execution remains blocked.

- [ ] **Step 5: Commit the handoff fix**

Commit: `fix: preserve expired handoffs for audit`

---

### Task 3: Make Hermes registration and legacy compatibility executable

**Files:**
- Modify: `__init__.py`
- Modify: `tests/smoke/plugin.test.ts`

**Interfaces:**
- `register(ctx)` registers seven public names and every v1 alias through Hermes' supported `ctx.register_skill(name, path, description)` API.
- `resolve_skill_name(name)` remains available for persisted data normalization.

- [ ] **Step 1: Write the failing Hermes registration test**

Use a context stub that exposes only the real Hermes `register_skill` API. Assert that `loopstack:using-loopstack`, all six lifecycle workflows, and every legacy alias are registered to an existing public skill path without relying on `register_skill_alias`.

- [ ] **Step 2: Run the smoke test and verify RED**

Run: `pnpm vitest run tests/smoke/plugin.test.ts`

Expected: FAIL because legacy aliases are currently registered only when a non-existent optional alias API is present.

- [ ] **Step 3: Register legacy names as read-only skill entries**

Map every legacy name to its public skill file and register it with a legacy description. Do not duplicate skill content or expose internal protocol files as top-level directories.

- [ ] **Step 4: Verify GREEN and Python syntax**

Run the smoke test and `python3 -m py_compile __init__.py`.

- [ ] **Step 5: Commit the Hermes compatibility fix**

Commit: `fix: register executable Hermes legacy aliases`

---

### Task 4: Add installable marketplaces and public release metadata

**Files:**
- Create: `.agents/plugins/marketplace.json`
- Create: `.claude-plugin/marketplace.json`
- Create: `LICENSE`
- Create: `tests/smoke/distribution.test.ts`
- Modify: `.codex-plugin/plugin.json`
- Modify: `.claude-plugin/plugin.json`
- Modify: `plugin.yaml`
- Modify: `package.json`
- Modify: `pnpm-lock.yaml`
- Modify: `README.md`

**Interfaces:**
- Codex install: `codex plugin marketplace add ErwanFx/loopstack`, then `codex plugin add loopstack@loopstack`.
- Claude Code install: `claude plugin marketplace add ErwanFx/loopstack`, then `claude plugin install loopstack@loopstack`.
- Hermes install: `hermes plugins install ErwanFx/loopstack --enable`, then explicitly load `loopstack:using-loopstack`.

- [ ] **Step 1: Write the failing distribution test**

Assert both marketplace files exist, point to the repository root, carry version `0.2.1` where required, all runtime manifests agree on `0.2.1`, `LICENSE` contains the MIT grant, and the README documents install, update, invocation, runtime dependencies, and the optional `architecture-diagram` enhancement.

- [ ] **Step 2: Run the focused test and verify RED**

Run: `pnpm vitest run tests/smoke/distribution.test.ts`

Expected: FAIL because marketplace files, license, and installation documentation are absent and manifests remain on `0.2.0`.

- [ ] **Step 3: Add release metadata and documentation**

Create root-source marketplace entries, add the MIT license, update all versions, and document exact install/update/first-use commands plus the runtime-neutral Learn behavior.

- [ ] **Step 4: Verify GREEN with real isolated installs**

Run the focused test, `claude plugin validate .`, the Codex plugin validator, an isolated Codex marketplace add/install, an isolated Claude marketplace add/install, and an isolated Hermes install/list.

- [ ] **Step 5: Commit the distribution release**

Commit: `feat: add multi-runtime plugin distribution`

---

### Task 5: Enforce the release contract in CI

**Files:**
- Create: `scripts/check-skills.ts`
- Create: `.github/workflows/ci.yml`
- Modify: `package.json`
- Modify: `tests/smoke/plugin.test.ts`
- Modify: `README.md`

**Interfaces:**
- `pnpm check` runs TypeScript compilation, schema synchronization, skill-frontmatter validation, and all Vitest suites.
- GitHub Actions runs `pnpm install --frozen-lockfile`, `pnpm check`, `pnpm build`, and `python3 -m py_compile __init__.py` on every push and pull request.

- [ ] **Step 1: Write a failing check-script smoke assertion**

Assert `package.json` invokes `tsx scripts/check-skills.ts`, and that the script checks exactly the seven public skills against the Codex-compatible frontmatter allowlist.

- [ ] **Step 2: Run the smoke test and verify RED**

Run: `pnpm vitest run tests/smoke/plugin.test.ts`

Expected: FAIL because the deterministic skill checker and CI workflow do not exist.

- [ ] **Step 3: Implement the deterministic check and CI workflow**

Add `check-skills.ts`, include it in `pnpm check`, add the GitHub Actions workflow, and document the release quality gate.

- [ ] **Step 4: Run full verification**

Run `pnpm check`, `pnpm build`, Python compilation, Claude validation, Codex plugin validation, all official public-skill validations, `git diff --check`, and secret/path scans.

- [ ] **Step 5: Commit the CI gate**

Commit: `ci: enforce plugin portability checks`
