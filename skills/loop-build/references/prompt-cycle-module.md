# Executable prompt-cycle module

Every agentic loop must contain `{loop-directory}/prompt-cycle.mjs`. A scheduler is only a trigger; this module binds the durable Loopstack controller to the chosen storage and agent runtime.

Export exactly:

```js
export async function createPromptCycleRun(context) {
  return {
    input: await loadPromptCycleInput(context),
    dependencies: {
      store: createDurableStore(),
      invoker: createRuntimeInvoker(),
      evaluator: createCycleEvaluator(),
    },
  };
}
```

The returned `input` must satisfy `PromptCycleInput`. The dependencies must implement `PromptCycleStore`, `AgentInvoker`, and `CycleEvaluator` from `src/orchestration/prompt-cycle-types.ts`.

## Runtime binding

Build the invoker with argument arrays and a structured result contract:

- Hermès: `hermes -p <profile> --oneshot <prompt> --skills <skills>` when a named profile is selected, otherwise omit `-p`; use a usage file for cost and require the final response to contain one `AgentRunResult` JSON object.
- Claude Code: `claude --print --output-format json --json-schema <schema> <prompt>` in a fresh non-persistent session.
- Codex: `codex exec --ephemeral --output-schema <schema-file> --output-last-message <result-file> <prompt>`.

Never reuse hidden chat state between iterations. Construct every maker/checker prompt only from the persisted `AgentRunRequest`. The checker receives no consequential write tools. Parse and validate the result before appending it to storage; malformed output fails the run.

The evaluator may be deterministic or model-backed. It must return exactly one of `continue`, `wait-human`, `wait-external`, `stop-success`, `stop-failure`, or `escalate`. A `continue` decision must provide the next persisted observations or snapshot whenever the state changed.

## Storage and trigger rules

- Load checkpoints and results from the selected Convex, Airtable, Google Sheets, or custom store using `loopId` and `workItemId`.
- Re-read the business source of truth at run start. A cron or webhook payload wakes the loop; it is not authoritative state.
- Derive an idempotency key before any consequential action.
- End the current run on human or external wait. Resume through a new invocation from the stored checkpoint.
- Reconcile an interrupted consequential action before retrying it.

## Required proof

Run the real entrypoint from the business repository root:

```bash
loopstack prompt-cycle run --loop loops/<loop-id>
```

QA must prove at least one maker → checker → maker correction, a terminal success, a human wait, resume, budget/deadline termination, no-progress termination, and unknown-side-effect escalation. Do not launch if the module is missing or if the command is only mocked.
