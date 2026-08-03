import { describe, expect, it } from "vitest";
import { hashGateEvidence } from "../../src/domain/handoff.js";
import { runPublicTransition } from "../../src/domain/orchestration.js";

const scopeHash = "a".repeat(64);
const planApproval = {
  gate: "plan-approval" as const,
  artifact: "plan-approval.yaml",
  artifact_hash: "b".repeat(64),
  scope_hash: scopeHash,
  approved_by: "owner",
  approved_at: "2026-08-03T20:00:00Z",
  expires_at: "2099-01-01T00:00:00Z",
};

const handoff = {
  route_version: "v2" as const,
  loop_id: "seo-growth",
  completed_skill: "loop-plan",
  journey: "loop-plan",
  substage: "loop-plan",
  status: "completed" as const,
  artifacts: ["plan-approval.yaml"],
  next_skill: "loop-build",
  next_journey: "loop-build",
  completed_workers: ["loop-plan"],
  pending_gate: null,
  scope_hash: scopeHash,
  artifact_hashes: { "plan-approval.yaml": "b".repeat(64) },
  gate_evidence: [planApproval],
  blocking_requirements: [],
};
const trust = {
  trustedEvidenceHashes: [hashGateEvidence(planApproval)],
  trustedArtifactHashes: handoff.artifact_hashes,
  trustedApprovers: ["owner"],
};

describe("public transition executor", () => {
  it("routes a fully authorized handoff without invoking external effects", () => {
    const calls = { routes: [] as string[], writes: 0, schedules: 0, activations: 0 };
    const executor = {
      routePublicSkill: (skill: string) => calls.routes.push(skill),
      writeExternal: () => calls.writes++,
      schedule: () => calls.schedules++,
      activate: () => calls.activations++,
    };
    expect(runPublicTransition(handoff, executor, trust)).toEqual({ kind: "routed", target: "loop-build" });
    expect(calls).toEqual({ routes: ["loop-build"], writes: 0, schedules: 0, activations: 0 });
  });

  it("fails before routing when authorization is missing", () => {
    const routes: string[] = [];
    expect(() => runPublicTransition(
      { ...handoff, gate_evidence: [] },
      { routePublicSkill: (skill) => routes.push(skill) },
    )).toThrow(/Missing plan-approval/);
    expect(routes).toEqual([]);
  });

  it("rejects self-declared evidence without an external trust registry", () => {
    expect(() => runPublicTransition(handoff, { routePublicSkill: () => undefined }))
      .toThrow(/external trust context/);
  });

  it("stops an approval handoff without routing", () => {
    const routes: string[] = [];
    const waiting = {
      ...handoff,
      status: "awaiting-approval" as const,
      next_skill: null,
      next_journey: "loop-build",
      pending_gate: "plan-approval" as const,
      gate_evidence: [],
      blocking_requirements: ["plan approval"],
    };
    expect(runPublicTransition(waiting, { routePublicSkill: (skill) => routes.push(skill) }))
      .toEqual({ kind: "stopped", target: null });
    expect(routes).toEqual([]);
  });
});
