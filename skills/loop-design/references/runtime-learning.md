# Runtime Learning Adapters

Every Loopstack design uses the same Learn contract while mapping implementation details to capabilities that actually exist in the selected runtime.

Operational learning is mandatory; self-modification is optional. Every run records evidence and evaluation, while reusable behavior changes must pass through a tested, reversible, and—when risk requires it—human-approved learning proposal.

## Common contract

### Operational evidence

Store state, traces, scores, gate events, decisions, and outcomes in the loop store. This evidence must remain queryable per `loopId` and must not depend on an agent's conversational memory.

### Reusable procedures

Promote a repeated, measured pattern into a versioned skill, instruction, playbook, or process patch only through a promoted learning proposal. Record the completed feedback windows, tests, evidence, approval, and rollback behind the change. Loopstack plugin-provided skills are read-only learning targets.

### Durable facts

Use persistent agent or project memory only for stable preferences, constraints, decisions, and environment conventions.

### Anti-noise

Require a recurring pattern, measured evidence, or an explicit owner correction before changing reusable behavior.

### Exclusions

Never put run logs, transient metrics, task progress, secrets, credentials, or raw data dumps in agent memory.

## Runtime adapters

### Hermes

Keep operational evidence in the loop store. After a promoted learning proposal, use Hermes native `skill_manage` only on a separate mutable project or per-loop skill; plugin-provided skills are read-only. Use durable memory for stable facts only. Optional audit or curation capabilities may assist maintenance but are not required on every run.

### Claude Code

Keep operational evidence in the loop store. Apply approved reusable changes to versioned project skills, commands, hooks, or instructions. Use project memory only for stable facts when available; do not invent Hermes-only tool calls.

### Codex

Keep operational evidence in the loop store. Apply approved reusable changes to versioned skills, repository artifacts, or project instructions. Use persistent project knowledge only when the runtime provides it; do not invent Hermes-only tool calls.

## Diagram capability

On Hermes, prefer `architecture-diagram` when installed. On Claude Code or Codex, use an equivalent installed visualization skill when available. Otherwise generate a self-contained HTML/SVG fallback with the runtime's normal file or code tools. The visual owner gate and required content stay identical across runtimes.
