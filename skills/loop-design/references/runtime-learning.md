# Runtime Learning Adapters

Every Loopstack design uses the same Learn contract while mapping implementation details to capabilities that actually exist in the selected runtime.

## Common contract

### Operational evidence

Store state, traces, scores, gate events, decisions, and outcomes in the loop store. This evidence must remain queryable per `loopId` and must not depend on an agent's conversational memory.

### Reusable procedures

Promote a repeated, measured pattern into a versioned skill, instruction, playbook, or process patch. Record the evidence and approval behind the change.

### Durable facts

Use persistent agent or project memory only for stable preferences, constraints, decisions, and environment conventions.

### Anti-noise

Require a recurring pattern, measured evidence, or an explicit owner correction before changing reusable behavior.

### Exclusions

Never put run logs, transient metrics, task progress, secrets, credentials, or raw data dumps in agent memory.

## Runtime adapters

### Hermes

Keep operational evidence in the loop store. Use Hermes native `skill_manage` for approved reusable procedure updates and durable memory for stable facts only. Optional audit or curation capabilities may assist maintenance but are not required on every run.

### Claude Code

Keep operational evidence in the loop store. Apply approved reusable changes to versioned project skills, commands, hooks, or instructions. Use project memory only for stable facts when available; do not invent Hermes-only tool calls.

### Codex

Keep operational evidence in the loop store. Apply approved reusable changes to versioned skills, repository artifacts, or project instructions. Use persistent project knowledge only when the runtime provides it; do not invent Hermes-only tool calls.

## Diagram capability

On Hermes, prefer `architecture-diagram` when installed. On Claude Code or Codex, use an equivalent installed visualization skill when available. Otherwise generate a self-contained HTML/SVG fallback with the runtime's normal file or code tools. The visual owner gate and required content stay identical across runtimes.
