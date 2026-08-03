import { z } from "zod";
import { ApprovalTokenSchema, approvePlan, hashPlan } from "../domain/approval-token.js";
import { BlueprintOperationSchema, StorageBlueprintSchema, type StorageBlueprint } from "./blueprints.js";
import { StorageProviderSchema } from "./schema.js";

export const ProvisioningModeSchema = z.enum(["bootstrap", "schema"]);
export type ProvisioningMode = z.infer<typeof ProvisioningModeSchema>;

export const ProvisioningPlanSchema = z.object({
  provider: StorageProviderSchema,
  environment: z.string().min(1),
  loopId: z.string().min(1),
  container: z.string().min(1),
  schemaVersion: z.literal(1),
  mode: ProvisioningModeSchema,
  expiresAt: z.iso.datetime(),
  operations: z.array(BlueprintOperationSchema).min(1),
}).superRefine((plan, context) => {
  if (plan.mode === "bootstrap") {
    const operation = plan.operations[0];
    if (plan.operations.length !== 1
      || operation.entity !== "providerBoundary"
      || operation.resource !== plan.container) {
      context.addIssue({
        code: "custom",
        path: ["operations"],
        message: "Bootstrap plans may contain only the provider boundary operation",
      });
    }
  } else if (plan.operations.some((operation) => operation.entity === "providerBoundary")) {
    context.addIssue({
      code: "custom",
      path: ["operations"],
      message: "Schema plans cannot contain provider boundary operations",
    });
  }
});

export type ProvisioningPlan = z.infer<typeof ProvisioningPlanSchema>;

export const ProvisioningApprovalSchema = ApprovalTokenSchema.extend({
  gate: z.enum(["bootstrap-approval", "schema-approval"]),
}).strict();
export type ProvisioningApproval = z.infer<typeof ProvisioningApprovalSchema>;
export type ProvisioningTrustContext = {
  trustedApprovalHashes: readonly string[];
  trustedApprovers: readonly string[];
};

export function hashProvisioningApproval(approvalInput: ProvisioningApproval): string {
  return hashPlan(ProvisioningApprovalSchema.parse(approvalInput));
}

export class ProvisioningAuthorizationError extends Error {
  constructor(readonly code:
    | "PLAN_APPROVAL_REQUIRED"
    | "PLAN_HASH_MISMATCH"
    | "PLAN_APPROVAL_EXPIRED"
    | "PLAN_APPROVAL_NOT_YET_VALID"
    | "PLAN_ENVIRONMENT_MISMATCH"
    | "PROVISIONING_GATE_MISMATCH"
    | "PROVISIONING_APPROVAL_UNTRUSTED") {
    super(code);
    this.name = "ProvisioningAuthorizationError";
  }
}

export function createProvisioningPlan(
  blueprintInput: StorageBlueprint,
  environment: string,
  expiresAt: string,
  mode: ProvisioningMode,
): ProvisioningPlan {
  const blueprint = StorageBlueprintSchema.parse(blueprintInput);
  const operations = mode === "bootstrap"
    ? [{
        entity: "providerBoundary",
        resource: blueprint.container,
        fields: ["loopId"],
        indexes: [],
        appendOnly: false,
        destructive: false as const,
      }]
    : blueprint.operations;
  return ProvisioningPlanSchema.parse({
    provider: blueprint.provider,
    environment,
    loopId: blueprint.loopId,
    container: blueprint.container,
    schemaVersion: blueprint.schemaVersion,
    mode,
    expiresAt,
    operations,
  });
}

export function approveProvisioningPlan(
  planInput: ProvisioningPlan,
  approver: string,
  approvedAt: string,
): ProvisioningApproval {
  const plan = ProvisioningPlanSchema.parse(planInput);
  return ProvisioningApprovalSchema.parse({
    ...approvePlan(plan, approver, approvedAt),
    gate: plan.mode === "bootstrap" ? "bootstrap-approval" : "schema-approval",
  });
}

export function authorizeProvisioning(
  planInput: ProvisioningPlan,
  approvalInput: ProvisioningApproval | null,
  now: string,
  trust?: ProvisioningTrustContext,
) {
  const plan = ProvisioningPlanSchema.parse(planInput);
  const validatedNow = z.iso.datetime().parse(now);
  const nowTime = Date.parse(validatedNow);
  if (!approvalInput) throw new ProvisioningAuthorizationError("PLAN_APPROVAL_REQUIRED");
  const approval = ProvisioningApprovalSchema.parse(approvalInput);
  const requiredGate = plan.mode === "bootstrap" ? "bootstrap-approval" : "schema-approval";
  if (approval.gate !== requiredGate) throw new ProvisioningAuthorizationError("PROVISIONING_GATE_MISMATCH");
  if (approval.planHash !== hashPlan(plan)) throw new ProvisioningAuthorizationError("PLAN_HASH_MISMATCH");
  if (approval.environment !== plan.environment) throw new ProvisioningAuthorizationError("PLAN_ENVIRONMENT_MISMATCH");
  if (!trust
    || !trust.trustedApprovalHashes.includes(hashProvisioningApproval(approval))
    || !trust.trustedApprovers.includes(approval.approver)) {
    throw new ProvisioningAuthorizationError("PROVISIONING_APPROVAL_UNTRUSTED");
  }
  if (nowTime < Date.parse(approval.approvedAt)) {
    throw new ProvisioningAuthorizationError("PLAN_APPROVAL_NOT_YET_VALID");
  }
  if (nowTime >= Date.parse(approval.expiresAt)) {
    throw new ProvisioningAuthorizationError("PLAN_APPROVAL_EXPIRED");
  }
  return {
    planHash: approval.planHash,
    gate: approval.gate,
    instructions: plan.operations.map((operation) =>
      `Using the authenticated native ${plan.provider} connection, create or verify ${operation.resource} non-destructively.`,
    ),
  };
}

export const ProvisioningEvidenceSchema = z.object({
  provider: StorageProviderSchema,
  environment: z.string().min(1),
  checkedAt: z.iso.datetime(),
  redacted: z.boolean(),
  resources: z.array(z.string()),
});

export function verifyProvisioningEvidence(planInput: ProvisioningPlan, evidenceInput: unknown) {
  const plan = ProvisioningPlanSchema.parse(planInput);
  const evidence = ProvisioningEvidenceSchema.parse(evidenceInput);
  const expected = [...new Set(plan.operations.map((operation) => operation.resource))];
  const missingResources = expected.filter((resource) => !evidence.resources.includes(resource));
  const blockers: string[] = [];
  if (evidence.provider !== plan.provider) blockers.push("provider_mismatch");
  if (evidence.environment !== plan.environment) blockers.push("environment_mismatch");
  if (!evidence.redacted) blockers.push("unredacted_evidence");
  if (missingResources.length > 0) blockers.push("missing_resources");
  return {
    status: blockers.length === 0 ? "verified" as const : "blocked" as const,
    blockers,
    missingResources,
    checkedAt: evidence.checkedAt,
  };
}
