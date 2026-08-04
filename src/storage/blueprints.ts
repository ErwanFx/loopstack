import { z } from "zod";
import { assertLoopId } from "../domain/ids.js";
import { StorageProviderSchema, type StorageProvider } from "./schema.js";

export const logicalEntities = [
  "loops", "loopVersions", "runs", "events", "observations", "decisions", "actions", "actionResults",
  "approvals", "evaluations", "alerts", "learnings", "costs", "heartbeats", "toolConnections",
  "workItems", "stateTransitions", "externalSubmissions", "deadlines", "learningProposals",
] as const;

type LogicalEntity = typeof logicalEntities[number];

const entityFields: Record<LogicalEntity, readonly string[]> = {
  loops: ["loopId", "name", "status", "currentVersion", "targetMetric", "timestamp"],
  loopVersions: ["loopId", "version", "definitionHash", "artifactRef", "timestamp"],
  runs: ["loopId", "runId", "workItemId", "status", "startedAt", "endedAt", "idempotencyKey", "timestamp"],
  events: ["loopId", "runId", "eventId", "eventType", "payloadHash", "idempotencyKey", "timestamp"],
  observations: ["loopId", "runId", "observationId", "source", "artifactRef", "evidenceHash", "timestamp"],
  decisions: ["loopId", "runId", "decisionId", "decision", "reason", "idempotencyKey", "timestamp"],
  actions: ["loopId", "runId", "actionId", "action", "status", "idempotencyKey", "timestamp"],
  actionResults: ["loopId", "runId", "actionId", "resultId", "status", "sideEffectState", "evidenceHash", "timestamp"],
  approvals: ["loopId", "runId", "approvalId", "gateId", "choice", "approvedBy", "timestamp"],
  evaluations: ["loopId", "runId", "evaluationId", "decision", "reason", "progressFingerprint", "timestamp"],
  alerts: ["loopId", "runId", "alertId", "code", "severity", "status", "timestamp"],
  learnings: ["loopId", "runId", "learningId", "evidenceIds", "summary", "timestamp"],
  costs: ["loopId", "runId", "costId", "provider", "model", "amount", "tokenUsage", "timestamp"],
  heartbeats: ["loopId", "runId", "heartbeatId", "status", "timestamp"],
  toolConnections: ["loopId", "connectionId", "provider", "status", "lastVerifiedAt", "timestamp"],
  workItems: [
    "loopId", "workItemId", "processVersion", "revision", "currentState", "status", "pendingGate",
    "deadline", "nextCheckAt", "externalReferenceIds", "missingInputs", "timestamp",
  ],
  stateTransitions: [
    "loopId", "workItemId", "transitionId", "runId", "fromState", "toState", "eventType", "actor",
    "resultingRevision", "idempotencyKey", "timestamp",
  ],
  externalSubmissions: [
    "loopId", "workItemId", "submissionId", "externalReference", "status", "evidenceHash",
    "idempotencyKey", "timestamp",
  ],
  deadlines: ["loopId", "workItemId", "deadlineId", "deadline", "status", "nextCheckAt", "timestamp"],
  learningProposals: [
    "loopId", "proposalId", "status", "targetArtifact", "risk", "evidenceIds", "feedbackWindowIds",
    "testEvidenceId", "approvedBy", "timestamp",
  ],
};

const runScoped = new Set<string>([
  "runs", "events", "observations", "decisions", "actions", "actionResults", "approvals", "evaluations",
  "alerts", "learnings", "costs", "heartbeats",
]);

const workItemScoped = new Set<LogicalEntity>([
  "workItems", "stateTransitions", "externalSubmissions", "deadlines",
]);

const idempotent = new Set<LogicalEntity>([
  "runs", "events", "decisions", "actions", "stateTransitions", "externalSubmissions",
]);

const appendOnly = new Set<LogicalEntity>([
  "events", "decisions", "stateTransitions", "externalSubmissions",
]);

export const BlueprintOperationSchema = z.object({
  entity: z.string().min(1),
  resource: z.string().min(1),
  fields: z.array(z.string()).min(1),
  indexes: z.array(z.string()),
  appendOnly: z.boolean(),
  destructive: z.literal(false),
});

export const StorageBlueprintSchema = z.object({
  provider: StorageProviderSchema,
  loopId: z.string().min(1),
  schemaVersion: z.literal(1),
  isolation: z.enum(["shared-by-loop-id", "workbook-per-loop"]),
  container: z.string().min(1),
  operations: z.array(BlueprintOperationSchema).min(1),
});

export type StorageBlueprint = z.infer<typeof StorageBlueprintSchema>;

function resourceName(provider: StorageProvider, entity: string): string {
  if (provider === "airtable") return `Loopstack ${entity}`;
  return entity;
}

export function createStorageBlueprint(providerInput: StorageProvider, loopIdInput: string): StorageBlueprint {
  const provider = StorageProviderSchema.parse(providerInput);
  const loopId = assertLoopId(loopIdInput);
  const operations: Array<z.infer<typeof BlueprintOperationSchema>> = logicalEntities.map((entity) => ({
    entity,
    resource: resourceName(provider, entity),
    fields: [...entityFields[entity]],
    indexes: provider === "convex" ? [
      "by_loop_id",
      ...(runScoped.has(entity) ? ["by_run_id"] : []),
      ...(workItemScoped.has(entity) ? ["by_work_item_id"] : []),
      ...(idempotent.has(entity) ? ["by_idempotency_key"] : []),
    ] : [],
    appendOnly: appendOnly.has(entity),
    destructive: false as const,
  }));

  if (provider === "google-sheets") {
    operations.push({
      entity: "schemaMetadata",
      resource: "_loopstack_schema",
      fields: ["loopId", "schemaVersion", "worksheetIds", "headerHashes"],
      indexes: [],
      appendOnly: false,
      destructive: false,
    });
  }

  return StorageBlueprintSchema.parse({
    provider,
    loopId,
    schemaVersion: 1,
    isolation: provider === "google-sheets" ? "workbook-per-loop" : "shared-by-loop-id",
    container: provider === "google-sheets" ? `loopstack-${loopId}` : "loopstack",
    operations,
  });
}
