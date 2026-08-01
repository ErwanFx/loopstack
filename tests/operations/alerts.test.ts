import { describe, expect, it } from "vitest";
import { dispatchAlert, formatAlert } from "../../src/operations/alerts.js";
import { buildRecoveryPlan } from "../../src/operations/recovery.js";

const alert = {
  code: "TOOL_TIMEOUT",
  loopId: "seo-growth",
  runId: "run-1",
  failedStep: "publish-draft",
  completedActions: ["research-keywords", "write-draft"],
  duplicateRisk: "unknown" as const,
  retryHistory: ["attempt-1 timed out"],
  recommendedAction: "reconcile CMS state",
  resumeCommand: "loopstack resume seo-growth run-1",
};

describe("alerts and recovery", () => {
  it("formats complete resume guidance", () => {
    const formatted = formatAlert(alert);
    for (const value of [alert.loopId, alert.runId, alert.failedStep, ...alert.completedActions, alert.duplicateRisk, ...alert.retryHistory, alert.recommendedAction, alert.resumeCommand]) {
      expect(formatted.message).toContain(value);
    }
  });

  it("records a secondary incident and fallback when delivery fails", async () => {
    const fallback: string[] = [];
    const result = await dispatchAlert(alert, async () => { throw new Error("channel unavailable"); }, (line) => fallback.push(line));
    expect(result.delivered).toBe(false);
    expect(result.incident?.code).toBe("ALERT_DELIVERY_FAILED");
    expect(fallback[0]).toContain("TOOL_TIMEOUT");
  });

  it("classifies retries from idempotency and terminal state", () => {
    const plan = buildRecoveryPlan([
      { id: "a1", idempotent: true, state: "failed" },
      { id: "a2", idempotent: true, state: "unknown" },
      { id: "a3", idempotent: false, state: "failed" },
    ]);
    expect(plan).toEqual([
      { id: "a1", strategy: "safe-to-retry" },
      { id: "a2", strategy: "reconcile-first" },
      { id: "a3", strategy: "human-only" },
    ]);
  });
});
