import { describe, expect, it } from "vitest";
import {
  assertGateAuthorization,
  createHandoff,
  hashGateEvidence,
  InvalidHandoffError,
  normalizeHandoff,
  resolveHandoffTarget,
  resolvePublicSkill,
  shouldAutoContinue,
  skillRoute,
} from "../../src/domain/handoff.js";
import type { GateKind } from "../../src/domain/types.js";

const scopeHash = "a".repeat(64);
const artifactHash = "b".repeat(64);

const base = {
  loop_id: "seo-growth",
  completed_skill: "loop-design",
  status: "completed" as const,
  artifacts: ["loop.yaml"],
  blocking_requirements: [],
};

const gateEvidence = (gate: GateKind, expires_at = "2099-01-01T00:00:00Z") => ({
  gate,
  artifact: `${gate}.yaml`,
  artifact_hash: artifactHash,
  scope_hash: scopeHash,
  approved_by: "owner",
  approved_at: "2026-08-03T20:00:00Z",
  expires_at,
});

function v2(
  completed_skill: string,
  next_skill: string | null,
  gates: GateKind[] = [],
) {
  const journey = resolvePublicSkill(completed_skill);
  const next_journey = next_skill ? resolvePublicSkill(next_skill) : null;
  return {
    loop_id: "seo-growth",
    route_version: "v2" as const,
    completed_skill,
    journey,
    substage: completed_skill,
    status: "completed" as const,
    artifacts: ["evidence.yaml", ...gates.map((gate) => `${gate}.yaml`)],
    next_skill,
    next_journey,
    completed_workers: [completed_skill],
    pending_gate: null,
    scope_hash: scopeHash,
    artifact_hashes: Object.fromEntries(gates.map((gate) => [`${gate}.yaml`, artifactHash])),
    gate_evidence: gates.map((gate) => gateEvidence(gate)),
    blocking_requirements: [],
  };
}

function trustFor(handoff: ReturnType<typeof v2>) {
  return {
    trustedEvidenceHashes: handoff.gate_evidence.map(hashGateEvidence),
    trustedArtifactHashes: handoff.artifact_hashes,
    trustedApprovers: ["owner"],
  };
}

describe("skill handoffs", () => {
  it("accepts the historical route and the gated public route from design", () => {
    expect(createHandoff({ ...base, next_skill: "loop-storage-design" }).next_skill).toBe("loop-storage-design");
    expect(createHandoff(v2("loop-design", "loop-plan", ["design-approval", "storage-approval"])).next_skill)
      .toBe("loop-plan");
  });

  it("rejects skipping directly from design to deploy or launch", () => {
    expect(() => createHandoff({ ...base, next_skill: "loop-deploy" })).toThrow(InvalidHandoffError);
    expect(() => createHandoff({ ...base, next_skill: "loop-launch" })).toThrow(InvalidHandoffError);
  });

  it("allows blocked v1 work to stop without a next skill", () => {
    const handoff = createHandoff({
      ...base,
      status: "blocked",
      next_skill: null,
      blocking_requirements: ["baseline metric is missing"],
    });
    expect(handoff.status).toBe("blocked");
  });

  it("preserves historical revision and bootstrap return routes", () => {
    expect(createHandoff({ ...base, completed_skill: "loop-design", next_skill: "loop-eric-review" }).next_skill)
      .toBe("loop-eric-review");
    expect(createHandoff({
      ...base,
      completed_skill: "loop-storage-setup",
      next_skill: "loop-connection-check",
      mode: "bootstrap",
    }).next_skill).toBe("loop-connection-check");
  });

  it("routes registry inspection into monitoring", () => {
    expect(createHandoff({ ...base, completed_skill: "loop-list", next_skill: "loop-show" }).next_skill)
      .toBe("loop-show");
    expect(createHandoff({ ...base, completed_skill: "loop-show", next_skill: "loop-monitor" }).next_skill)
      .toBe("loop-monitor");
  });

  it("allows only declared terminal workflows to complete without a next skill", () => {
    expect(createHandoff({ ...base, completed_skill: "loop-qualify", next_skill: null }).next_skill).toBeNull();
    expect(createHandoff({ ...base, completed_skill: "loop-operate", next_skill: null }).next_skill).toBeNull();
    expect(() => createHandoff({ ...base, next_skill: null })).toThrow(InvalidHandoffError);
  });

  it("normalizes and resolves v1 without destroying source metadata", () => {
    const source = {
      ...base,
      completed_skill: "loop-eric-review",
      next_skill: "loop-plan",
      review_version: 2,
    };
    const normalized = normalizeHandoff(source);
    expect(normalized.journey).toBe("loop-design");
    expect(normalized.next_journey).toBe("loop-plan");
    expect(normalized.source.review_version).toBe(2);
    expect(resolveHandoffTarget(source)).toBe("loop-plan");
  });

  it("requires the complete dual-write contract for explicit v2 records", () => {
    expect(() => createHandoff({ ...base, route_version: "v2", next_skill: "loop-plan" })).toThrow();
    expect(() => createHandoff({
      ...v2("loop-discover", "loop-design"),
      next_journey: "loop-launch",
    })).toThrow(InvalidHandoffError);
  });

  it("treats omitted route_version as v1 and rejects public v2 edges", () => {
    expect(skillRoute["loop-plan"]).toEqual(["loop-implement"]);
    expect(skillRoute["loop-plan"]).not.toContain("loop-build");
    expect(skillRoute["loop-launch"]).toBeUndefined();
    expect(() => createHandoff({
      ...base,
      completed_skill: "loop-design",
      next_skill: "loop-plan",
    })).toThrow(InvalidHandoffError);
    expect(() => createHandoff({
      ...base,
      completed_skill: "loop-launch",
      next_skill: "loop-operate",
      activation_allowed: true,
    })).toThrow(InvalidHandoffError);
  });

  it("does not let an explicit v2 handoff fall back to an atomic v1 route", () => {
    expect(() => createHandoff({
      ...v2("loop-plan", "loop-build", ["plan-approval"]),
      next_skill: "loop-implement",
      next_journey: "loop-build",
    })).toThrow(InvalidHandoffError);
  });

  it("fails closed when a sensitive route lacks its exact gate", () => {
    expect(() => createHandoff(v2("loop-plan", "loop-build"))).toThrow(/Missing plan-approval/);
    expect(() => createHandoff(v2("loop-plan", "loop-build", ["design-approval"]))).toThrow(/Missing plan-approval/);
    expect(() => createHandoff(v2("loop-build", "loop-launch"))).toThrow(/Missing qa-pass/);
  });

  it("rejects mismatched scope while preserving expired evidence for audit", () => {
    const mismatched = v2("loop-plan", "loop-build", ["plan-approval"]);
    mismatched.gate_evidence[0].scope_hash = "c".repeat(64);
    expect(() => createHandoff(mismatched)).toThrow(/does not match/);

    const wrongArtifactHash = v2("loop-plan", "loop-build", ["plan-approval"]);
    wrongArtifactHash.artifact_hashes["plan-approval.yaml"] = "d".repeat(64);
    expect(() => createHandoff(wrongArtifactHash)).toThrow(/artifact hash/);

    const expired = v2("loop-launch", "loop-operate", ["activation-approval"]);
    expired.gate_evidence[0].expires_at = "2020-01-01T00:00:00Z";
    Object.assign(expired, { activation_allowed: true });
    expect(createHandoff(expired).gate_evidence[0].expires_at).toBe("2020-01-01T00:00:00Z");
    expect(normalizeHandoff(expired).source.gate_evidence[0].expires_at).toBe("2020-01-01T00:00:00Z");
    expect(() => assertGateAuthorization(createHandoff(expired), "activation-approval", trustFor(expired)))
      .toThrow(/expired/);
    expect(() => shouldAutoContinue(createHandoff(expired), trustFor(expired))).toThrow(/expired/);

    const futureApproval = v2("loop-plan", "loop-build", ["plan-approval"]);
    futureApproval.gate_evidence[0].approved_at = "2099-01-01T00:00:00Z";
    expect(createHandoff(futureApproval).gate_evidence[0].approved_at).toBe("2099-01-01T00:00:00Z");
    expect(() => assertGateAuthorization(createHandoff(futureApproval), "plan-approval", trustFor(futureApproval)))
      .toThrow(/future/);
  });

  it("requires a scoped, expiring activation approval and activation flag", () => {
    const missingExpiry = v2("loop-launch", "loop-operate", ["activation-approval"]);
    missingExpiry.gate_evidence[0].expires_at = null as never;
    expect(() => createHandoff(missingExpiry)).toThrow();

    const activation = v2("loop-launch", "loop-operate", ["activation-approval"]);
    expect(() => createHandoff(activation)).toThrow(/explicitly allowed/);
    Object.assign(activation, { activation_allowed: true });
    expect(createHandoff(activation).activation_allowed).toBe(true);
  });

  it("checks internal mutation gates independently from route gates", () => {
    const source = v2("loop-plan", "loop-build", ["plan-approval", "bootstrap-approval"]);
    const buildEntry = createHandoff(source);
    const trust = trustFor(source);
    expect(() => assertGateAuthorization(buildEntry, "schema-approval", trust)).toThrow(/Missing schema-approval/);
    expect(() => assertGateAuthorization(buildEntry, "bootstrap-approval", trust)).not.toThrow();
    expect(() => assertGateAuthorization(buildEntry, "bootstrap-approval", trust, new Date("invalid")))
      .toThrow(/valid current time/);
  });

  it("auto-continues only with externally trusted evidence and never downgrades v1", () => {
    const authorized = v2("loop-plan", "loop-build", ["plan-approval"]);
    expect(() => shouldAutoContinue(createHandoff(authorized))).toThrow(/external trust context/);
    expect(shouldAutoContinue(createHandoff(authorized), trustFor(authorized))).toBe(true);
    expect(() => shouldAutoContinue(v2("loop-plan", "loop-build") as never)).toThrow(/Missing plan-approval/);
    expect(shouldAutoContinue(createHandoff({
      ...base,
      completed_skill: "loop-plan",
      next_skill: "loop-implement",
    }))).toBe(false);
    expect(shouldAutoContinue(createHandoff({
      ...base,
      completed_skill: "loop-eric-review",
      next_skill: "loop-plan",
    }))).toBe(true);
  });
});
