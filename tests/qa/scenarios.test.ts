import { readFileSync } from "node:fs";
import { parse } from "yaml";
import { describe, expect, it } from "vitest";
import { executeQaScenario } from "../../src/qa/scenario-executor.js";

const expected = {
  nominal: ["pass", null],
  "missing-data": ["blocked", "MISSING_DATA"],
  "low-confidence": ["approval-required", "LOW_CONFIDENCE"],
  "rejected-approval": ["stopped", "APPROVAL_REJECTED"],
  "duplicate-webhook": ["deduplicated", "DUPLICATE_IGNORED"],
  "tool-timeout": ["alerted", "SIDE_EFFECT_UNKNOWN"],
  "budget-exhausted": ["stopped", "BUDGET_EXHAUSTED"],
  "agent-interrupted": ["resumable", "STALE_HEARTBEAT"],
  "delayed-external-response": ["waiting", "EXTERNAL_RESPONSE_DELAYED"],
  "human-approval-timeout": ["alerted", "HUMAN_APPROVAL_TIMEOUT"],
  "invalid-state-transition": ["blocked", "INVALID_STATE_TRANSITION"],
  "revision-conflict": ["blocked", "REVISION_CONFLICT"],
  "stale-work-item": ["blocked", "STALE_WORK_ITEM"],
  "partial-documents": ["blocked", "PARTIAL_DOCUMENT_SET"],
  "external-submission-rejected": ["stopped", "EXTERNAL_SUBMISSION_REJECTED"],
  "learning-evidence-insufficient": ["blocked", "LEARNING_EVIDENCE_INSUFFICIENT"],
  "readonly-plugin-target": ["blocked", "READONLY_PLUGIN_TARGET"],
  "max-iterations": ["stopped", "MAX_ITERATIONS"],
  "no-progress": ["stopped", "NO_PROGRESS"],
  "checker-rejected": ["resumable", "CHECKER_REJECTED"],
  "controller-resume": ["resumable", "CONTROLLER_RESUME"],
} as const;

describe("failure injection scenarios", () => {
  for (const [name, [terminal, alertCode]] of Object.entries(expected)) {
    it(name, () => {
      const fixture = name in {
        nominal: true,
        "missing-data": true,
        "low-confidence": true,
        "rejected-approval": true,
        "duplicate-webhook": true,
        "tool-timeout": true,
        "budget-exhausted": true,
        "agent-interrupted": true,
      }
        ? parse(readFileSync(`tests/fixtures/scenarios/${name}.yaml`, "utf8"))
        : { scenario: name, inject: `deterministic ${name} failure` };
      const result = executeQaScenario(fixture);
      expect(result.terminal).toBe(terminal);
      expect(result.alertCode).toBe(alertCode);
      expect(new Set(result.actionIds).size).toBe(result.actionIds.length);
      if (name === "tool-timeout") {
        expect(result.actionState).toBe("unknown");
        expect(result.autoRetry).toBe(false);
        expect(result.reconciliationRequired).toBe(true);
      }
      if (name === "human-approval-timeout") {
        expect(result.autoRetry).toBe(false);
        expect(result.actionIds).toEqual([]);
      }
      if (name === "checker-rejected") {
        expect(result.actionState).toBe("none");
        expect(result.autoRetry).toBe(false);
      }
    });
  }
});
