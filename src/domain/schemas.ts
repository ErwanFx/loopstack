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

export const MeasurementTargetSchema = z.object({
  metric: MetricKeySchema,
  desired: z.number().finite(),
  horizonDays: z.number().int().positive(),
  direction: z.enum(["at-least", "at-most", "equal"]).default("at-least"),
  sourceOfTruth: z.string().min(1).optional(),
});

const CurrentMeasurementSchema = z.object({
  value: z.number().finite(),
  observedAt: z.iso.datetime(),
});

export const TriggerSchema = z.object({
  id: LoopIdSchema.optional(),
  type: z.enum(["manual", "cron", "webhook", "event", "queue"]),
  role: z.enum(["primary", "recovery", "watchdog", "resume"]).default("primary"),
  enabled: z.literal(false).default(false),
  source: z.string().min(1).optional(),
  event: z.string().min(1).optional(),
  idempotencyKey: z.string().min(1).optional(),
  debounceSeconds: z.number().int().nonnegative().optional(),
  replayWindowHours: z.number().int().positive().optional(),
  payloadSchemaRef: z.string().min(1).optional(),
  recoveryPurpose: z.string().min(1).optional(),
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
  gates: z.array(z.object({
    id: LoopIdSchema,
    beforeAction: LoopIdSchema,
    risk: z.enum(["low", "medium", "high"]),
    conditions: z.array(z.string().min(1)).min(1),
    evidenceArtifacts: z.array(z.string().min(1)).min(1),
    choices: z.array(z.enum(["approve", "edit", "reject", "request-information"]))
      .min(1)
      .refine((choices) => choices.includes("approve"), "Human gate choices must include approve"),
    approvers: z.array(z.string().min(1)).min(1),
    timeoutHours: z.number().positive(),
    onTimeout: z.enum(["escalate", "reject", "pause"]),
    onReject: LoopIdSchema,
    resumeFrom: LoopIdSchema,
  })).default([]),
});

export const GuardrailSchema = z.object({
  metric: MetricKeySchema,
  operator: z.enum(["lt", "lte", "eq", "gte", "gt"]),
  threshold: z.number().finite(),
  sourceOfTruth: z.string().min(1),
  evaluationWindowDays: z.number().int().positive(),
  onBreach: z.enum(["pause", "stop", "escalate"]),
});

export const ServiceLevelSchema = z.object({
  metric: MetricKeySchema,
  operator: z.enum(["lt", "lte", "eq", "gte", "gt"]),
  threshold: z.number().finite(),
  appliesTo: z.number().min(0).max(1),
});

export const LoopDefinitionSchema = z.object({
  schemaVersion: z.literal(3).default(3),
  id: LoopIdSchema,
  name: z.string().min(1),
  version: z.number().int().positive(),
  status: LoopStatusSchema,
  architectureShape: z.enum(["control-loop", "workflow-with-control-loop", "multi-loop-system"])
    .default("control-loop"),
  target: MeasurementTargetSchema,
  current: CurrentMeasurementSchema,
  triggers: z.array(TriggerSchema).min(1),
  feedback: z.array(FeedbackSchema).min(1),
  guardrails: z.array(GuardrailSchema).default([]),
  serviceLevels: z.array(ServiceLevelSchema).default([]),
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
