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
} as const;

describe("failure injection scenarios", () => {
  for (const [name, [terminal, alertCode]] of Object.entries(expected)) {
    it(name, () => {
      const fixture = parse(readFileSync(`tests/fixtures/scenarios/${name}.yaml`, "utf8"));
      const result = executeQaScenario(fixture);
      expect(result.terminal).toBe(terminal);
      expect(result.alertCode).toBe(alertCode);
      expect(new Set(result.actionIds).size).toBe(result.actionIds.length);
      if (name === "tool-timeout") {
        expect(result.actionState).toBe("unknown");
        expect(result.autoRetry).toBe(false);
        expect(result.reconciliationRequired).toBe(true);
      }
    });
  }
});
