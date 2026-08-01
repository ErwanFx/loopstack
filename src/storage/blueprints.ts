import { z } from "zod";
import { assertLoopId } from "../domain/ids.js";
import { StorageProviderSchema, type StorageProvider } from "./schema.js";

export const logicalEntities = [
  "loops", "loopVersions", "runs", "events", "observations", "decisions", "actions", "actionResults",
  "approvals", "evaluations", "alerts", "learnings", "costs", "heartbeats", "toolConnections",
] as const;

const runScoped = new Set<string>([
  "runs", "events", "observations", "decisions", "actions", "actionResults", "approvals", "evaluations",
  "alerts", "learnings", "costs", "heartbeats",
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
    fields: [
      "loopId",
      ...(runScoped.has(entity) ? ["runId", "eventId", "timestamp", "idempotencyKey"] : ["timestamp"]),
      "payload",
    ],
    indexes: provider === "convex" ? ["by_loop_id", ...(runScoped.has(entity) ? ["by_run_id", "by_idempotency_key"] : [])] : [],
    appendOnly: entity === "events" || entity === "decisions",
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
