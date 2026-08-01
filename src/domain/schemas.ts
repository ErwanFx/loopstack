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

export const HandoffSchema = z.object({
  loop_id: LoopIdSchema,
  completed_skill: LoopIdSchema,
  status: z.enum(["completed", "blocked", "awaiting-approval"]),
  artifacts: z.array(z.string()),
  next_skill: LoopIdSchema.nullable().optional(),
  blocking_requirements: z.array(z.string()),
});
