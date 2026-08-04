import { z } from "zod";
import { LoopIdSchema } from "../domain/ids.js";

const EventIdSchema = z.string()
  .min(1)
  .regex(/^[a-z0-9]+(?:[.-][a-z0-9]+)*$/, "Use a stable lowercase event identifier");

export const ProcessStateSchema = z.object({
  id: LoopIdSchema,
  type: z.enum(["active", "waiting-human", "waiting-external", "terminal"]),
  slaHours: z.number().positive().optional(),
  slaExemptReason: z.string().min(1).optional(),
});

export const ProcessTransitionSchema = z.object({
  from: LoopIdSchema,
  event: EventIdSchema,
  to: LoopIdSchema,
  actor: z.enum(["agent", "human", "system", "external"]),
  action: LoopIdSchema.optional(),
  gateId: LoopIdSchema.optional(),
});

export const ProcessDefinitionSchema = z.object({
  schemaVersion: z.literal(1),
  version: z.number().int().positive(),
  loopId: LoopIdSchema,
  kind: z.enum(["control-loop", "workflow-with-control-loop", "multi-loop-system"]),
  workItem: z.object({
    entityName: LoopIdSchema,
    idField: z.string().min(1).regex(/^[a-z][A-Za-z0-9]*$/, "Use a stable field identifier"),
  }),
  initialState: LoopIdSchema,
  gateIds: z.array(LoopIdSchema).default([]),
  states: z.array(ProcessStateSchema).min(1),
  transitions: z.array(ProcessTransitionSchema),
}).superRefine((process, context) => {
  const stateIds = new Set<string>();
  for (const state of process.states) {
    if (stateIds.has(state.id)) {
      context.addIssue({ code: "custom", message: `Duplicate state: ${state.id}` });
    }
    stateIds.add(state.id);
    if ((state.type === "waiting-human" || state.type === "waiting-external")
      && state.slaHours === undefined
      && state.slaExemptReason === undefined) {
      context.addIssue({
        code: "custom",
        message: `Waiting state ${state.id} requires an SLA or slaExemptReason`,
      });
    }
  }

  if (!stateIds.has(process.initialState)) {
    context.addIssue({ code: "custom", message: `Initial state does not exist: ${process.initialState}` });
  }

  const gateIds = new Set<string>();
  for (const gateId of process.gateIds) {
    if (gateIds.has(gateId)) {
      context.addIssue({ code: "custom", message: `Duplicate gate: ${gateId}` });
    }
    gateIds.add(gateId);
  }

  const terminalIds = new Set(process.states
    .filter((state) => state.type === "terminal")
    .map((state) => state.id));
  for (const transition of process.transitions) {
    if (!stateIds.has(transition.from) || !stateIds.has(transition.to)) {
      context.addIssue({
        code: "custom",
        message: `Transition references an unknown state: ${transition.from} -> ${transition.to}`,
      });
    }
    if (terminalIds.has(transition.from)) {
      context.addIssue({
        code: "custom",
        message: `Terminal state ${transition.from} cannot have outgoing transitions`,
      });
    }
    if (transition.gateId !== undefined && !gateIds.has(transition.gateId)) {
      context.addIssue({ code: "custom", message: `Transition references an unknown gate: ${transition.gateId}` });
    }
  }
});

export const WorkItemStatusSchema = z.enum([
  "active",
  "waiting-human",
  "waiting-external",
  "completed",
]);

export const WorkItemSchema = z.object({
  id: LoopIdSchema,
  loopId: LoopIdSchema,
  processVersion: z.number().int().positive(),
  currentState: LoopIdSchema,
  status: WorkItemStatusSchema,
  revision: z.number().int().nonnegative(),
  externalReferences: z.record(z.string(), z.string()).default({}),
  missingInputs: z.array(z.string().min(1)).default([]),
  pendingGate: LoopIdSchema.nullable().default(null),
  deadline: z.iso.datetime().nullable().default(null),
  nextCheckAt: z.iso.datetime().nullable().default(null),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});

export const WorkItemEventSchema = z.object({
  event: EventIdSchema,
  actor: z.enum(["agent", "human", "system", "external"]),
  occurredAt: z.iso.datetime(),
  idempotencyKey: z.string().min(1),
  expectedRevision: z.number().int().nonnegative(),
});

export type ProcessDefinition = z.infer<typeof ProcessDefinitionSchema>;
export type ProcessState = z.infer<typeof ProcessStateSchema>;
export type WorkItem = z.infer<typeof WorkItemSchema>;
export type WorkItemEvent = z.infer<typeof WorkItemEventSchema>;

