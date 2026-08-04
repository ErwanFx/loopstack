import { z } from "zod";
import { LoopIdSchema } from "../domain/ids.js";

const ArtifactNameSchema = z.string()
  .min(1)
  .regex(/^[a-z0-9]+(?:[._-][a-z0-9]+)*$/, "Use a stable lowercase artifact name");

const ResourceLockSchema = z.string()
  .min(1)
  .regex(/^[a-z0-9]+(?:[._:-][a-z0-9]+)*$/, "Use a stable lowercase resource lock");

export const GraphExecutionModeSchema = z.enum([
  "deterministic-with-ai-improvement",
  "single-agent-multi-session",
  "multi-agent",
]);

export const GraphAgentBindingSchema = z.object({
  id: LoopIdSchema,
  runtime: z.enum(["portable", "hermes", "claude-code", "codex"]),
  profile: z.string().min(1).optional(),
  description: z.string().min(1).optional(),
  sessionPolicy: z.enum(["fresh", "resume"]).default("fresh"),
  maxConcurrency: z.number().int().positive().default(1),
  requiredSkills: z.array(z.string().min(1)).default([]),
  requiredTools: z.array(z.string().min(1)).default([]),
});

const CommonNodeShape = {
  id: LoopIdSchema,
  purpose: z.string().min(1),
  inputs: z.array(ArtifactNameSchema).default([]),
  outputs: z.array(ArtifactNameSchema).default([]),
  resourceLocks: z.array(ResourceLockSchema).default([]),
  sideEffect: z.enum(["none", "reversible", "consequential"]).default("none"),
  idempotencyKeyRef: z.string().min(1).optional(),
  timeoutSeconds: z.number().int().positive().optional(),
};

export const AgentGraphNodeSchema = z.object({
  ...CommonNodeShape,
  kind: z.literal("agent"),
  agentId: LoopIdSchema,
  role: z.enum(["operator", "reviewer", "improver"]),
  promptRef: z.string().min(1),
  session: z.enum(["fresh", "resume"]).default("fresh"),
  skills: z.array(z.string().min(1)).default([]),
  tools: z.array(z.string().min(1)).default([]),
});

export const SkillGraphNodeSchema = z.object({
  ...CommonNodeShape,
  kind: z.literal("skill"),
  agentId: LoopIdSchema,
  skills: z.array(z.string().min(1)).min(1),
  promptRef: z.string().min(1).optional(),
  session: z.enum(["fresh", "resume"]).default("fresh"),
});

export const ToolGraphNodeSchema = z.object({
  ...CommonNodeShape,
  kind: z.literal("tool"),
  toolRef: z.string().min(1),
});

export const TransformGraphNodeSchema = z.object({
  ...CommonNodeShape,
  kind: z.literal("transform"),
  transformRef: z.string().min(1),
});

export const RouterGraphNodeSchema = z.object({
  ...CommonNodeShape,
  kind: z.literal("router"),
  decisionArtifact: ArtifactNameSchema,
});

export const EvaluatorGraphNodeSchema = z.object({
  ...CommonNodeShape,
  kind: z.literal("evaluator"),
  mode: z.enum(["ai", "deterministic"]),
  agentId: LoopIdSchema.optional(),
  modelRef: z.string().min(1).optional(),
  promptRef: z.string().min(1).optional(),
  evaluatorRef: z.string().min(1).optional(),
  session: z.enum(["fresh", "resume"]).default("fresh"),
  criteria: z.array(z.string().min(1)).min(1),
}).superRefine((node, context) => {
  if (node.mode === "ai" && ((node.agentId === undefined && node.modelRef === undefined) || node.promptRef === undefined)) {
    context.addIssue({ code: "custom", message: "AI evaluator nodes require promptRef and either agentId or modelRef" });
  }
  if (node.mode === "deterministic" && node.evaluatorRef === undefined) {
    context.addIssue({ code: "custom", message: "Deterministic evaluator nodes require evaluatorRef" });
  }
});

export const HumanGateGraphNodeSchema = z.object({
  ...CommonNodeShape,
  kind: z.literal("human-gate"),
  gateId: LoopIdSchema,
});

export const JoinGraphNodeSchema = z.object({
  ...CommonNodeShape,
  kind: z.literal("join"),
  activation: z.enum(["all", "any"]),
  minimumInputs: z.number().int().positive().optional(),
});

export const SubgraphNodeSchema = z.object({
  ...CommonNodeShape,
  kind: z.literal("subgraph"),
  graphRef: z.string().min(1),
});

export const PromptGraphNodeSchema = z.union([
  AgentGraphNodeSchema,
  SkillGraphNodeSchema,
  ToolGraphNodeSchema,
  TransformGraphNodeSchema,
  RouterGraphNodeSchema,
  EvaluatorGraphNodeSchema,
  HumanGateGraphNodeSchema,
  JoinGraphNodeSchema,
  SubgraphNodeSchema,
]);

export const GraphConditionSchema = z.object({
  path: z.string().min(1),
  operator: z.enum(["eq", "neq", "gt", "gte", "lt", "lte", "in", "exists", "not-exists"]),
  value: z.unknown().optional(),
}).superRefine((condition, context) => {
  const valueFree = condition.operator === "exists" || condition.operator === "not-exists";
  if (!valueFree && condition.value === undefined) {
    context.addIssue({ code: "custom", message: `${condition.operator} conditions require a value` });
  }
});

export const PromptGraphEdgeSchema = z.object({
  id: LoopIdSchema.optional(),
  from: LoopIdSchema,
  to: LoopIdSchema,
  type: z.enum(["data", "control"]),
  artifact: ArtifactNameSchema.optional(),
  when: GraphConditionSchema.optional(),
  dependencyReason: z.string().min(1).optional(),
  maxTraversals: z.number().int().positive().optional(),
}).superRefine((edge, context) => {
  if (edge.type === "data" && edge.artifact === undefined) {
    context.addIssue({ code: "custom", message: "Data edges require an artifact" });
  }
});

export const GraphBudgetsSchema = z.object({
  maxSteps: z.number().int().positive(),
  maxCost: z.number().nonnegative(),
  maxDurationSeconds: z.number().int().positive(),
  maxConcurrency: z.number().int().positive().default(1),
  maxRetriesPerNode: z.number().int().nonnegative().default(0),
});

export const GraphEvidenceAnchorSchema = z.object({
  id: LoopIdSchema,
  nodeId: LoopIdSchema,
  evidence: z.string().min(1),
  immutable: z.literal(true),
});

export const GraphImprovementSchema = z.object({
  enabled: z.literal(true),
  nodeId: LoopIdSchema,
  feedbackArtifacts: z.array(ArtifactNameSchema).min(1),
  evaluationSuiteRef: z.string().min(1),
  protectedNodeIds: z.array(LoopIdSchema),
  proposalPolicy: z.enum(["human-approved", "risk-gated"]),
  minFeedbackWindows: z.number().int().positive(),
});

export const PromptGraphDefinitionSchema = z.object({
  schemaVersion: z.literal(1),
  id: LoopIdSchema,
  loopId: LoopIdSchema,
  version: z.number().int().positive(),
  executionMode: GraphExecutionModeSchema,
  entrypoint: LoopIdSchema,
  agents: z.array(GraphAgentBindingSchema).default([]),
  budgets: GraphBudgetsSchema,
  nodes: z.array(PromptGraphNodeSchema).min(1),
  edges: z.array(PromptGraphEdgeSchema).default([]),
  anchors: z.array(GraphEvidenceAnchorSchema).default([]),
  improvement: GraphImprovementSchema,
});
