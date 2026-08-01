import { describe, expect, it } from "vitest";
import { runQa, type QaInput } from "../../src/qa/runner.js";

const passing: QaInput = {
  manifest: "valid",
  connections: "verified",
  storageContract: "verified",
  scenarios: "pass",
  approvals: "pass",
  idempotency: "pass",
  alerts: "pass",
  canary: "pass",
};

describe("ordered QA runner", () => {
  it("blocks activation when one mandatory gate fails", async () => {
    const report = await runQa({ ...passing, idempotency: "fail" });
    expect(report.verdict).toBe("blocked");
    expect(report.blockers[0].code).toBe("DUPLICATE_SIDE_EFFECT_RISK");
  });

  it("does not run canary after a static blocker", async () => {
    const report = await runQa({ ...passing, manifest: "invalid" });
    expect(report.gates.find((gate) => gate.name === "canary")).toBeUndefined();
    expect(report.blockers[0].code).toBe("INVALID_MANIFEST");
  });

  it("passes only with machine-readable evidence from every gate", async () => {
    const report = await runQa(passing);
    expect(report.verdict).toBe("pass");
    expect(report.gates.every((gate) => gate.status === "pass")).toBe(true);
    expect(report.markdown).toContain("QA verdict: pass");
  });
});
