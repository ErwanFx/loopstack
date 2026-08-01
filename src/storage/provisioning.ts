import { z } from "zod";
import { ApprovalTokenSchema, hashPlan, type ApprovalToken } from "../domain/approval-token.js";
import { BlueprintOperationSchema, StorageBlueprintSchema, type StorageBlueprint } from "./blueprints.js";
import { StorageProviderSchema } from "./schema.js";

export const ProvisioningPlanSchema = z.object({
  provider: StorageProviderSchema,
  environment: z.string().min(1),
  loopId: z.string().min(1),
  schemaVersion: z.literal(1),
  expiresAt: z.iso.datetime(),
  operations: z.array(BlueprintOperationSchema).min(1),
});

export type ProvisioningPlan = z.infer<typeof ProvisioningPlanSchema>;

export class ProvisioningAuthorizationError extends Error {
  constructor(readonly code: "PLAN_APPROVAL_REQUIRED" | "PLAN_HASH_MISMATCH" | "PLAN_APPROVAL_EXPIRED" | "PLAN_ENVIRONMENT_MISMATCH") {
    super(code);
    this.name = "ProvisioningAuthorizationError";
  }
}

export function createProvisioningPlan(
  blueprintInput: StorageBlueprint,
  environment: string,
  expiresAt: string,
): ProvisioningPlan {
  const blueprint = StorageBlueprintSchema.parse(blueprintInput);
  return ProvisioningPlanSchema.parse({
    provider: blueprint.provider,
    environment,
    loopId: blueprint.loopId,
    schemaVersion: blueprint.schemaVersion,
    expiresAt,
    operations: blueprint.operations,
  });
}

export function authorizeProvisioning(planInput: ProvisioningPlan, approvalInput: ApprovalToken | null, now: string) {
  const plan = ProvisioningPlanSchema.parse(planInput);
  if (!approvalInput) throw new ProvisioningAuthorizationError("PLAN_APPROVAL_REQUIRED");
  const approval = ApprovalTokenSchema.parse(approvalInput);
  if (approval.planHash !== hashPlan(plan)) throw new ProvisioningAuthorizationError("PLAN_HASH_MISMATCH");
  if (approval.environment !== plan.environment) throw new ProvisioningAuthorizationError("PLAN_ENVIRONMENT_MISMATCH");
  if (Date.parse(now) > Date.parse(approval.expiresAt)) throw new ProvisioningAuthorizationError("PLAN_APPROVAL_EXPIRED");
  return {
    planHash: approval.planHash,
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
