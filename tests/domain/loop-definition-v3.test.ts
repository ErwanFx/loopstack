import { describe, expect, it } from "vitest";
import { normalizeLoopDefinition } from "../../src/domain/loop-definition.js";

const legacySeoLoop = {
  id: "seo-growth",
  name: "SEO Growth",
  version: 1,
  status: "designing",
  target: { metric: "qualified_leads", desired: 40, horizonDays: 90 },
  current: { value: 12, observedAt: "2026-08-01T00:00:00.000Z" },
  triggers: [{ type: "manual" }],
  feedback: [{ metric: "qualified_leads", delayDays: 30 }],
};

const pvAdminLoop = {
  id: "pv-admin",
  name: "PV administration",
  version: 1,
  status: "designing",
  architectureShape: "workflow-with-control-loop",
  target: {
    metric: "dossier_submission_cycle_hours",
    desired: 192,
    horizonDays: 90,
    direction: "at-most",
    sourceOfTruth: "crm",
  },
  current: { value: 260, observedAt: "2026-08-01T00:00:00.000Z" },
  guardrails: [{
    metric: "administrative_rejection_rate",
    operator: "lte",
    threshold: 0.08,
    sourceOfTruth: "crm",
    evaluationWindowDays: 90,
    onBreach: "pause",
  }],
  serviceLevels: [{
    metric: "dossier_submission_cycle_hours",
    operator: "lte",
    threshold: 192,
    appliesTo: 0.9,
  }],
  triggers: [{
    id: "visit-validated",
    type: "event",
    role: "primary",
    source: "crm",
    event: "technical_visit.validated",
    idempotencyKey: "client_id+visit_version",
    debounceSeconds: 30,
    replayWindowHours: 72,
    payloadSchemaRef: "schemas/technical-visit-validated.json",
  }],
  feedback: [{ metric: "administrative_rejection_rate", delayDays: 30 }],
  approval: {
    mode: "conditional",
    requiredFor: ["submit-mairie"],
    approvers: ["admin-owner"],
    gates: [{
      id: "approve-mairie-submission",
      beforeAction: "submit-mairie",
      risk: "high",
      conditions: ["official-submission"],
      evidenceArtifacts: ["mairie-dossier-preview.pdf"],
      choices: ["approve", "edit", "reject", "request-information"],
      approvers: ["admin-owner"],
      timeoutHours: 48,
      onTimeout: "escalate",
      onReject: "collecting-documents",
      resumeFrom: "submit-mairie",
    }],
  },
};

describe("Loop Definition v3", () => {
  it("normalizes a legacy loop into safe disabled v3 defaults", () => {
    const normalized = normalizeLoopDefinition(legacySeoLoop);
    expect(normalized.schemaVersion).toBe(3);
    expect(normalized.architectureShape).toBe("control-loop");
    expect(normalized.target.direction).toBe("at-least");
    expect(normalized.guardrails).toEqual([]);
    expect(normalized.serviceLevels).toEqual([]);
    expect(normalized.triggers[0]).toMatchObject({ role: "primary", enabled: false });
  });

  it("preserves measurable targets, trigger controls, guardrails, and human gates", () => {
    const normalized = normalizeLoopDefinition(pvAdminLoop);
    expect(normalized.target.direction).toBe("at-most");
    expect(normalized.guardrails[0]).toMatchObject({ operator: "lte", onBreach: "pause" });
    expect(normalized.serviceLevels[0].appliesTo).toBe(0.9);
    expect(normalized.triggers[0]).toMatchObject({
      enabled: false,
      idempotencyKey: "client_id+visit_version",
      replayWindowHours: 72,
    });
    expect(normalized.approval?.gates[0]).toMatchObject({
      beforeAction: "submit-mairie",
      onTimeout: "escalate",
      resumeFrom: "submit-mairie",
    });
  });

  it("rejects enabled triggers and malformed safety boundaries", () => {
    expect(() => normalizeLoopDefinition({
      ...legacySeoLoop,
      triggers: [{ type: "cron", enabled: true }],
    })).toThrow();
    expect(() => normalizeLoopDefinition({
      ...pvAdminLoop,
      triggers: [{ ...pvAdminLoop.triggers[0], idempotencyKey: "" }],
    })).toThrow();
    expect(() => normalizeLoopDefinition({
      ...pvAdminLoop,
      approval: {
        ...pvAdminLoop.approval,
        gates: [{ ...pvAdminLoop.approval.gates[0], timeoutHours: 0 }],
      },
    })).toThrow();
    expect(() => normalizeLoopDefinition({
      ...pvAdminLoop,
      approval: {
        ...pvAdminLoop.approval,
        gates: [{ ...pvAdminLoop.approval.gates[0], choices: ["edit", "reject"] }],
      },
    })).toThrow(/approve/);
  });
});
