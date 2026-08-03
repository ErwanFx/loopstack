# Loopstack

Loopstack discovers, designs, plans, builds, launches, and operates measurable AI loops.

## Public workflow

```text
using-loopstack
  → loop-discover
  → loop-design
  → loop-plan
  → loop-build
  → loop-launch
  → loop-operate
```

Transitions between completed, authorized, non-blocked phases are automatic. The workflow stops only for a real decision, approval, mutation, activation, blocker, or completion.

## Why the surface is small

Loopstack 0.2 keeps specialist procedures as progressively loaded references instead of exposing every internal concern as a user-facing skill. This follows the workflow structure popularized by [Superpowers](https://github.com/obra/superpowers): compact routing skills, exact terminal states, continuous execution, persistent evidence, and hard gates.

## Internal protocols

- `loop-discover`: discovery + qualification/readiness
- `loop-design`: functional + storage design + read-only connection check + critical review
- `loop-build`: storage setup + implementation + QA
- `loop-launch`: progressive deployment
- `loop-operate`: list/show + monitor + debug + modify + improve

## Safety boundaries

These remain explicit and cannot be widened by a transition:

- functional blueprint approval;
- storage blueprint approval;
- separate, scope-bound bootstrap and schema approvals;
- implementation-plan approval;
- activation/deployment approval.

Read-only checks, deterministic validation, approved build tasks, and QA auto-chain without a conversational “continue?” prompt.

## v1 compatibility

Persisted handoffs using v1 names continue to validate. Runtimes resolve them through `resolveHandoffTarget()` (TypeScript) or `resolve_skill_name()` (Hermes Python) rather than invoking raw `next_skill` values. Legacy transitions into `loop-build` or `loop-launch` stop until a strict v2 handoff carries the required gate evidence; read-only ECOI `loop-eric-review → loop-plan` remains resumable:

| v1 protocol | Public workflow |
|---|---|
| `loop-idea`, `loop-qualify` | `loop-discover` |
| `loop-storage-design`, `loop-connection-check`, `loop-eric-review` | `loop-design` |
| `loop-storage-setup`, `loop-implement`, `loop-qa` | `loop-build` |
| `loop-deploy` | `loop-launch` |
| `loop-list`, `loop-show`, `loop-monitor`, `loop-debug`, `loop-modify`, `loop-improve` | `loop-operate` |

For example, an existing `loop-eric-review → loop-plan` handoff resumes at `loop-plan` without replaying discovery or design.

Approval is fail-closed: self-declared handoff evidence is only structurally valid. Auto-routing requires an external trust registry containing the evidence hash, independently trusted artifact hash, and approver. Provisioning additionally binds its trusted approval token to an explicit `bootstrap` or `schema` mode.

## Development

```bash
npm install
npm run check
```

The repository validates public registration, v1 routes, executable alias resolution, strict v2 dual-write records, scope-bound gate evidence, route-only auto-transitions, domain schemas, storage operations, QA, and runtime behavior.
