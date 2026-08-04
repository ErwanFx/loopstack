# Loopstack

Loopstack discovers, designs, plans, builds, launches, and operates measurable AI loops.

It ships the same seven workflows as a plugin for Hermes Agent, Claude Code, and Codex. Hermes is the primary runtime, while the design contract remains portable: operational history lives in the loop store and reusable improvements use the selected runtime's real skill or instruction mechanism.

## What Loopstack builds

Installing Loopstack installs the framework for interviewing, qualifying, designing, building, testing, launching, and operating loops. It does not install one universal autonomous agent. Each generated loop gets its own versioned process package, mutable domain skills, typed gates and triggers, loop store records separated by `loopId`, QA scenarios, and inert activation plan.

An AI Loop is defined by its executable prompt-cycle controller: it repeatedly creates a bounded request from durable state, prompts a maker agent, observes the real result, optionally prompts a separate checker, evaluates, persists a checkpoint, and decides whether to continue, wait, stop, or escalate. A cron, webhook, dashboard, or state machine can trigger or surround this controller, but is not the loop by itself.

The canonical technical cycle is:

```text
Target → Observe state → Evaluate/Plan → Act → Observe result → Evaluate outcome → Learn → Decide
```

The compact six-box view—Target → Observe → Evaluate → Act → Learn → Decide—remains useful for a simple infographic, but generated contracts and QA keep the pre-action and post-action observations/evaluations distinct.

Loopstack separates three layers:

- the durable business process: work items, states, waits, deadlines, external responses, and human approvals;
- the control loop: target, observations, actions, outcomes, learning, and next decision;
- the agent runtime: actual maker/checker invocations through `HermesRuntimeAdapter`, `ClaudeCodeRuntimeAdapter`, or `CodexRuntimeAdapter`.

For example, the included photovoltaic administration reference architecture creates a dossier work item, lets the maker prepare missing evidence, lets the checker validate it, waits at a human mairie-submission gate, resumes in a new run after approval, then waits for the external response. The work item may live for weeks; every agent run remains bounded.

## Install

### Codex

```bash
codex plugin marketplace add ErwanFx/loopstack
codex plugin add loopstack@loopstack
```

Start in Codex by invoking `$loopstack:using-loopstack` and describing the business process. To refresh the marketplace and install the current release:

```bash
codex plugin marketplace upgrade loopstack
codex plugin remove loopstack
codex plugin add loopstack@loopstack
```

### Claude Code

```bash
claude plugin marketplace add ErwanFx/loopstack
claude plugin install loopstack@loopstack
```

Start with `/loopstack:using-loopstack`. Update the installed plugin with:

```bash
claude plugin update loopstack@loopstack
```

### Hermes Agent

```bash
hermes plugins install ErwanFx/loopstack --enable
```

Explicitly load `loopstack:using-loopstack`, then describe the process to interview and qualify. Hermes keeps the public skills namespaced and also registers executable compatibility names for persisted v1 handoffs. Update with:

```bash
hermes plugins update loopstack
```

The skill-only workflows have no Node.js dependency. Node.js 20+ and pnpm are required only to use the TypeScript CLI or develop and verify this repository. Storage and business-tool connections are selected per loop; none is globally required by the plugin.

The Hermes `architecture-diagram` skill is an optional visual enhancement. If it is absent—or when the runtime is Claude Code or Codex—Loopstack can generate the same approval artifact as a self-contained HTML/SVG fallback.

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

Loopstack 0.3.0 keeps specialist procedures as progressively loaded references instead of exposing every internal concern as a user-facing skill. This follows the workflow structure popularized by [Superpowers](https://github.com/obra/superpowers): compact routing skills, exact terminal states, continuous execution, persistent evidence, and hard gates.

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

The release quality gate validates TypeScript, synchronized schemas, the exact seven-skill public surface, Codex-compatible frontmatter, public registration, v1 routes, executable alias resolution, strict v2 dual-write records, scope-bound gate evidence, route-only auto-transitions, storage operations, QA, and runtime behavior. GitHub Actions also rebuilds the CLI and compiles the Hermes adapter on every push and pull request.
