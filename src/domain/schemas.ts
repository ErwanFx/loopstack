import { z } from "zod";
import { LoopIdSchema } from "./ids.js";

export const loopStatuses = [
  "idea",
  "qualifying",
  "blocked",
  "designing",
  "planned",
  "awaiting-approval",
  "building",
  "qa-failed",
  "ready",
  "shadow",
  "canary",
  "active",
  "paused",
  "degraded",
  "failed",
  "inactive",
  "archived",
] as const;

export const LoopStatusSchema = z.enum(loopStatuses);

const MetricKeySchema = z
  .string()
  .min(1)
  .regex(/^[a-z0-9]+(?:[_-][a-z0-9]+)*$/, "Use a stable lowercase metric key");

const MeasurementTargetSchema = z.object({
  metric: MetricKeySchema,
  desired: z.number().finite(),
  horizonDays: z.number().int().positive(),
});

const CurrentMeasurementSchema = z.object({
  value: z.number().finite(),
  observedAt: z.iso.datetime(),
});

const TriggerSchema = z.object({
  type: z.enum(["manual", "cron", "webhook", "event", "queue"]),
  configuration: z.record(z.string(), z.unknown()).optional(),
});

const FeedbackSchema = z.object({
  metric: MetricKeySchema,
  delayDays: z.number().int().nonnegative(),
});

export const ApprovalPolicySchema = z.object({
  mode: z.enum(["always", "conditional", "never"]),
  requiredFor: z.array(z.string()).default([]),
  approvers: z.array(z.string()).default([]),
});

export const LoopDefinitionSchema = z.object({
  id: LoopIdSchema,
  name: z.string().min(1),
  version: z.number().int().positive(),
  status: LoopStatusSchema,
  target: MeasurementTargetSchema,
  current: CurrentMeasurementSchema,
  triggers: z.array(TriggerSchema).min(1),
  feedback: z.array(FeedbackSchema).min(1),
  approval: ApprovalPolicySchema.optional(),
});

export const publicJourneys = [
  "loop-discover",
  "loop-design",
  "loop-plan",
  "loop-build",
  "loop-launch",
  "loop-operate",
] as const;

export const PublicJourneySchema = z.enum(publicJourneys);

export const GateKindSchema = z.enum([
  "design-approval",
  "storage-approval",
  "plan-approval",
  "bootstrap-approval",
  "schema-approval",
  "qa-pass",
  "activation-approval",
]);

export const Sha256Schema = z.string().regex(/^[a-f0-9]{64}$/);

export const GateEvidenceSchema = z.object({
  gate: GateKindSchema,
  artifact: z.string().min(1),
  artifact_hash: Sha256Schema,
  scope_hash: Sha256Schema,
  approved_by: z.string().min(1),
  approved_at: z.iso.datetime(),
  expires_at: z.iso.datetime(),
}).strict();

const HandoffBaseShape = {
  loop_id: LoopIdSchema,
  completed_skill: LoopIdSchema,
  status: z.enum(["completed", "blocked", "awaiting-approval"]),
  artifacts: z.array(z.string()),
  next_skill: LoopIdSchema.nullable().optional(),
  blocking_requirements: z.array(z.string()),
  mode: z.enum(["bootstrap", "schema"]).optional(),
  revision_id: z.string().min(1).optional(),
  planning_allowed: z.boolean().optional(),
  activation_allowed: z.boolean().optional(),
};

/** Read-compatible schema for persisted handoffs created before consolidation. */
export const HandoffV1Schema = z.object({
  ...HandoffBaseShape,
  route_version: z.literal("v1").optional(),
  journey: PublicJourneySchema.optional(),
  substage: z.string().min(1).optional(),
  next_journey: PublicJourneySchema.nullable().optional(),
  completed_workers: z.array(LoopIdSchema).optional(),
  pending_gate: z.string().min(1).nullable().optional(),
}).passthrough();

/** Strict dual-write contract for public consolidated workflow handoffs. */
export const HandoffV2Schema = z.object({
  ...HandoffBaseShape,
  route_version: z.literal("v2"),
  journey: PublicJourneySchema,
  substage: z.string().min(1),
  next_journey: PublicJourneySchema.nullable(),
  completed_workers: z.array(LoopIdSchema).min(1),
  pending_gate: GateKindSchema.nullable(),
  scope_hash: Sha256Schema,
  artifact_hashes: z.record(z.string().min(1), Sha256Schema),
  gate_evidence: z.array(GateEvidenceSchema),
}).strict();

export const HandoffSchema = z.union([HandoffV2Schema, HandoffV1Schema]);
