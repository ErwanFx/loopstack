import { createHash } from "node:crypto";
import { z } from "zod";

export const ApprovalTokenSchema = z.object({
  planHash: z.string().regex(/^[a-f0-9]{64}$/),
  approver: z.string().min(1),
  approvedAt: z.iso.datetime(),
  environment: z.string().min(1),
  expiresAt: z.iso.datetime(),
});

export type ApprovalToken = z.infer<typeof ApprovalTokenSchema>;

function sortCanonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortCanonical);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, nested]) => [key, sortCanonical(nested)]),
    );
  }
  return value;
}

export function hashPlan(plan: unknown): string {
  return createHash("sha256").update(JSON.stringify(sortCanonical(plan))).digest("hex");
}

export function approvePlan(
  plan: { environment: string; expiresAt: string },
  approver: string,
  approvedAt: string,
): ApprovalToken {
  return ApprovalTokenSchema.parse({
    planHash: hashPlan(plan),
    approver,
    approvedAt,
    environment: plan.environment,
    expiresAt: plan.expiresAt,
  });
}
