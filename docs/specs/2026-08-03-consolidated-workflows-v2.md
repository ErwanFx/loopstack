# Loopstack v2 — Consolidated workflow design

**Status:** approved by Erwan on 2026-08-03
**Goal:** make Loopstack transitions fluid, intuitive, and coherent while preserving every meaningful safety and approval boundary.

## Inspiration from Superpowers

Adopt these structural patterns from `obra/superpowers`:

1. a bootstrap/router skill that establishes mandatory process discipline;
2. a small public workflow surface with exact terminal transitions;
3. automatic continuation between authorized non-mutating steps;
4. continuous execution without “should I continue?” prompts;
5. hard gates stated explicitly and backed by artifacts;
6. progressive disclosure through references instead of monolithic skills;
7. persistent ledgers/handoffs for compaction recovery;
8. fresh verification evidence before completion claims.

Do not copy software-development-specific content or make Loopstack one monolithic skill.

## Public skill surface

Hermes registers only:

```text
using-loopstack
loop-discover
loop-design
loop-plan
loop-build
loop-launch
loop-operate
```

Canonical flow:

```text
using-loopstack → loop-discover → loop-design → loop-plan
→ loop-build → loop-launch → loop-operate
```

`loop-operate` may route to itself for read-only monitoring or to `loop-plan` for an approved change proposal.

## Internal protocols

Legacy atomic procedures remain in the repository as progressively loaded references:

| Public workflow | Internal protocols |
|---|---|
| `loop-discover` | idea discovery, qualification, readiness |
| `loop-design` | functional design, storage design, read-only connection check, Eric critical review |
| `loop-plan` | versioned implementation/mutation plan |
| `loop-build` | storage bootstrap/schema setup, implementation, QA |
| `loop-launch` | deploy, shadow, canary, activation |
| `loop-operate` | list/show, monitor, debug, modify, improve |

Legacy skill names remain valid in handoff validation as v1 aliases, but are not registered as public skills. Runtimes must resolve persisted `next_skill` through the canonical resolver; Hermes native aliases are registered separately when the host supports them.

## Gate policy

Stop only for:

1. a business decision that changes scope or target;
2. functional blueprint approval;
3. storage blueprint approval;
4. an external mutation carrying its own exact gate evidence (`bootstrap-approval` or `schema-approval`), in addition to the approved plan;
5. implementation-plan approval;
6. activation/deployment approval;
7. an unresolved blocker or contradictory instruction;
8. completion.

Do not stop for:

- loading another internal protocol;
- read-only connection checks;
- deterministic validation;
- QA already included in an approved implementation plan;
- handoff creation;
- moving between internal steps of the same public workflow.

Approval scope never widens across a transition.

Every v2 handoff dual-writes `journey`, `substage`, `next_journey`, `completed_workers`, `pending_gate`, `scope_hash`, `artifact_hashes`, and typed `gate_evidence`. Structural validation checks the exact gate kind, attached artifact, handoff hash consistency, matching scope and expiry. Authorization and auto-routing additionally require an external trust context containing the approved evidence hash, independently trusted artifact hash, and trusted approver. A plan approval cannot satisfy storage mutation or activation gates.

## Design sequence

`loop-design` runs:

1. functional blueprint draft;
2. functional critical self-review;
3. functional visual approval;
4. storage blueprint draft;
5. read-only connection check;
6. full Eric critical review;
7. targeted corrections;
8. storage visual approval;
9. terminal transition to `loop-plan`.

If the full review materially changes an already-approved functional component, request a targeted reapproval. Otherwise do not reopen it.

For new loops, storage provisioning is not performed during design. Missing targets become explicit plan/build tasks.

## Build sequence

`loop-build` runs only from an approved plan/hash:

1. preflight and plan-hash verification;
2. separately approved storage bootstrap/schema mutations when listed;
3. implementation tasks;
4. QA automatically;
5. machine-readable manifest and QA report;
6. stop if blocked, otherwise transition to `loop-launch` without a conversational handoff prompt.

## Compatibility

- Keep the v1 route table for existing artifacts.
- Add a canonical v2 public route table.
- Add executable resolvers and optional native aliases from legacy skills to public workflows.
- Preserve original names when parsing legacy handoffs, but stop legacy routes entering `loop-build` or `loop-launch` until they are migrated to strict v2 gate evidence.
- Reject any skip that bypasses plan, build/QA, or launch approval.
- Current ECOI handoff `loop-eric-review → loop-plan` must validate and resume at public `loop-plan` without repeating prior work.

## Plugin registration

Hermes `register()` uses an explicit public allowlist instead of scanning every directory. Claude-compatible packaging may retain internal protocol files as references, but documentation identifies the seven public skills.

## Verification

Required evidence:

- public registration test lists exactly seven skills;
- canonical route tests pass;
- legacy route tests pass;
- alias resolution tests pass;
- gate classification tests prove missing, mismatched, wrong-kind, or expired evidence cannot auto-chain;
- a route-only executor test proves public transitions have no mutation, scheduling, or activation capability;
- invalid skip tests still fail;
- current ECOI handoff resolves to `loop-plan`;
- all existing storage, QA, runtime, and operations tests pass;
- full `npm run check` passes.
