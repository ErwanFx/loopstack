import { describe, expect, it } from "vitest";
import { approvePlan } from "../../src/domain/approval-token.js";
import { createStorageBlueprint } from "../../src/storage/blueprints.js";
import {
  authorizeProvisioning,
  createProvisioningPlan,
  verifyProvisioningEvidence,
} from "../../src/storage/provisioning.js";

const blueprint = createStorageBlueprint("convex", "seo-growth");
const plan = createProvisioningPlan(blueprint, "production", "2026-08-02T12:00:00.000Z");

describe("native provisioning approval", () => {
  it("refuses provisioning without approval", () => {
    expect(() => authorizeProvisioning(plan, null, "2026-08-01T12:00:00.000Z")).toThrowError(
      expect.objectContaining({ code: "PLAN_APPROVAL_REQUIRED" }),
    );
  });

  it("invalidates approval after the plan changes", () => {
    const approval = approvePlan(plan, "erwan", "2026-08-01T12:00:00.000Z");
    const modified = {
      ...plan,
      operations: [...plan.operations, { ...plan.operations[0], resource: "unexpected" }],
    };
    expect(() => authorizeProvisioning(modified, approval, "2026-08-01T13:00:00.000Z")).toThrowError(
      expect.objectContaining({ code: "PLAN_HASH_MISMATCH" }),
    );
  });

  it("refuses expired approval", () => {
    const approval = approvePlan(plan, "erwan", "2026-08-01T12:00:00.000Z");
    expect(() => authorizeProvisioning(plan, approval, "2026-08-03T00:00:00.000Z")).toThrowError(
      expect.objectContaining({ code: "PLAN_APPROVAL_EXPIRED" }),
    );
  });

  it("returns native execution instructions but performs no provider call", () => {
    const approval = approvePlan(plan, "erwan", "2026-08-01T12:00:00.000Z");
    const authorization = authorizeProvisioning(plan, approval, "2026-08-01T13:00:00.000Z");
    expect(authorization.instructions).toHaveLength(plan.operations.length);
    expect(authorization.instructions[0]).toContain("native convex connection");
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
