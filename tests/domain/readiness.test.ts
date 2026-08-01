import { describe, expect, it } from "vitest";
import { evaluateReadiness, type ReadinessCandidate } from "../../src/domain/readiness.js";

const completeCandidate: ReadinessCandidate = {
  recurringOpportunity: true,
  target: { metric: "qualified_leads", desired: 40 },
  currentState: { value: 12, observedAt: "2026-08-01T00:00:00.000Z" },
  gap: { value: 28 },
  actionSpace: ["research", "draft", "publish-with-approval"],
  feedback: [{ metric: "qualified_leads", delayDays: 30 }],
  measurementHorizonDays: 90,
  dataAccess: "verified",
  owner: "Head of Growth",
  approvalPolicy: { mode: "conditional", requiredFor: ["publish"] },
  budget: { maxCostPerRun: 25, maxIterations: 3 },
  stopConditions: ["budget exceeded"],
  escalationConditions: ["three failed runs"],
  idempotencyStrategy: "deduplicate by keyword and content hash",
  storageConnection: "connected",
  toolConnections: [{ name: "openseo", status: "connected" }],
  alertConnection: "tested",
  runSuccessCriteria: ["draft passes factual checks"],
  businessSuccessCriteria: ["40 qualified leads within 90 days"],
  evidenceQuality: 0.8,
  leverage: 0.9,
  reversibility: 0.7,
  dataCompleteness: 0.9,
  measurementSpeed: 0.6,
};

describe("strict readiness gate", () => {
  it("returns ready only when every hard requirement is present", () => {
    const report = evaluateReadiness(completeCandidate);
    expect(report.status).toBe("ready");
    expect(report.blocking).toEqual([]);
    expect(report.score).toBeGreaterThan(0);
  });

  it("blocks a high-scoring proposal without measurable feedback", () => {
    const report = evaluateReadiness({ ...completeCandidate, feedback: [] });
    expect(report.status).toBe("blocked");
    expect(report.blocking).toContain("feedback_signal");
  });

  it("blocks a proposal without tested alert delivery", () => {
    const report = evaluateReadiness({ ...completeCandidate, alertConnection: "untested" });
    expect(report.blocking).toContain("tested_alert_channel");
  });

  it("does not let a perfect advisory score bypass a hard blocker", () => {
    const report = evaluateReadiness({
      ...completeCandidate,
      owner: "",
      evidenceQuality: 1,
      leverage: 1,
      reversibility: 1,
      dataCompleteness: 1,
      measurementSpeed: 1,
    });
    expect(report.score).toBe(100);
    expect(report.status).toBe("blocked");
    expect(report.blocking).toContain("named_owner");
  });
});
