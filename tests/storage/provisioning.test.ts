import { describe, expect, it } from "vitest";
import { createStorageBlueprint } from "../../src/storage/blueprints.js";
import {
  approveProvisioningPlan,
  authorizeProvisioning,
  createProvisioningPlan,
  hashProvisioningApproval,
  verifyProvisioningEvidence,
} from "../../src/storage/provisioning.js";

const blueprint = createStorageBlueprint("convex", "seo-growth");
const plan = createProvisioningPlan(blueprint, "production", "2026-08-02T12:00:00.000Z", "schema");
const trustFor = (approval: ReturnType<typeof approveProvisioningPlan>) => ({
  trustedApprovalHashes: [hashProvisioningApproval(approval)],
  trustedApprovers: [approval.approver],
});

describe("native provisioning approval", () => {
  it("refuses provisioning without approval", () => {
    expect(() => authorizeProvisioning(plan, null, "2026-08-01T12:00:00.000Z")).toThrowError(
      expect.objectContaining({ code: "PLAN_APPROVAL_REQUIRED" }),
    );
  });

  it("refuses a self-declared approval without a trusted registry entry", () => {
    const approval = approveProvisioningPlan(plan, "erwan", "2026-08-01T12:00:00.000Z");
    expect(() => authorizeProvisioning(plan, approval, "2026-08-01T13:00:00.000Z")).toThrowError(
      expect.objectContaining({ code: "PROVISIONING_APPROVAL_UNTRUSTED" }),
    );
  });

  it("invalidates approval after the plan changes", () => {
    const approval = approveProvisioningPlan(plan, "erwan", "2026-08-01T12:00:00.000Z");
    const modified = {
      ...plan,
      operations: [...plan.operations, { ...plan.operations[0], resource: "unexpected" }],
    };
    expect(() => authorizeProvisioning(modified, approval, "2026-08-01T13:00:00.000Z")).toThrowError(
      expect.objectContaining({ code: "PLAN_HASH_MISMATCH" }),
    );
  });

  it("refuses a bootstrap approval for schema provisioning", () => {
    const approval = approveProvisioningPlan(plan, "erwan", "2026-08-01T12:00:00.000Z");
    expect(() => authorizeProvisioning(
      plan,
      { ...approval, gate: "bootstrap-approval" },
      "2026-08-01T13:00:00.000Z",
    )).toThrowError(expect.objectContaining({ code: "PROVISIONING_GATE_MISMATCH" }));
  });

  it("refuses a bootstrap label on schema operations", () => {
    const forged = { ...plan, mode: "bootstrap" as const };
    expect(() => approveProvisioningPlan(forged, "erwan", "2026-08-01T12:00:00.000Z"))
      .toThrow(/Bootstrap plans/);
  });

  it("refuses invalid current time instead of bypassing temporal checks", () => {
    const approval = approveProvisioningPlan(plan, "erwan", "2026-08-01T12:00:00.000Z");
    expect(() => authorizeProvisioning(plan, approval, "not-a-date", trustFor(approval))).toThrow();
  });

  it("refuses expired and not-yet-valid approval", () => {
    const approval = approveProvisioningPlan(plan, "erwan", "2026-08-01T12:00:00.000Z");
    expect(() => authorizeProvisioning(plan, approval, "2026-08-02T12:00:00.000Z", trustFor(approval))).toThrowError(
      expect.objectContaining({ code: "PLAN_APPROVAL_EXPIRED" }),
    );
    expect(() => authorizeProvisioning(plan, approval, "2026-08-03T00:00:00.000Z", trustFor(approval))).toThrowError(
      expect.objectContaining({ code: "PLAN_APPROVAL_EXPIRED" }),
    );
    expect(() => authorizeProvisioning(plan, approval, "2026-07-31T00:00:00.000Z", trustFor(approval))).toThrowError(
      expect.objectContaining({ code: "PLAN_APPROVAL_NOT_YET_VALID" }),
    );
  });

  it("returns native schema instructions but performs no provider call", () => {
    const approval = approveProvisioningPlan(plan, "erwan", "2026-08-01T12:00:00.000Z");
    const authorization = authorizeProvisioning(plan, approval, "2026-08-01T13:00:00.000Z", trustFor(approval));
    expect(authorization.gate).toBe("schema-approval");
    expect(authorization.instructions).toHaveLength(plan.operations.length);
    expect(authorization.instructions[0]).toContain("native convex connection");
  });

  it("creates and authorizes bootstrap plans with a distinct gate", () => {
    const bootstrap = createProvisioningPlan(blueprint, "production", "2026-08-02T12:00:00.000Z", "bootstrap");
    const approval = approveProvisioningPlan(bootstrap, "erwan", "2026-08-01T12:00:00.000Z");
    expect(approval.gate).toBe("bootstrap-approval");
    expect(bootstrap.operations).toEqual([
      expect.objectContaining({ entity: "providerBoundary", resource: blueprint.container }),
    ]);
    expect(bootstrap.operations.some((operation) => operation.entity === "loops")).toBe(false);
    expect(authorizeProvisioning(bootstrap, approval, "2026-08-01T13:00:00.000Z", trustFor(approval)).gate)
      .toBe("bootstrap-approval");
  });

  it("verifies all planned resources from redacted evidence", () => {
    const complete = verifyProvisioningEvidence(plan, {
      provider: "convex",
      environment: "production",
      checkedAt: "2026-08-01T14:00:00.000Z",
      redacted: true,
      resources: plan.operations.map((operation) => operation.resource),
    });
    expect(complete.status).toBe("verified");

    const incomplete = verifyProvisioningEvidence(plan, {
      provider: "convex",
      environment: "production",
      checkedAt: "2026-08-01T14:00:00.000Z",
      redacted: true,
      resources: [],
    });
    expect(incomplete.status).toBe("blocked");
    expect(incomplete.missingResources).toContain("loops");
  });
});
