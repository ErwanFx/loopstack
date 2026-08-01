import { z } from "zod";

export const storageProviders = ["convex", "airtable", "google-sheets"] as const;
export const StorageProviderSchema = z.enum(storageProviders);

export const OperationalRecordSchema = z.object({
  loopId: z.string().min(1),
  runId: z.string().min(1).optional(),
  eventId: z.string().min(1).optional(),
  timestamp: z.iso.datetime(),
  idempotencyKey: z.string().min(1).optional(),
  payload: z.record(z.string(), z.unknown()),
});

export type StorageProvider = z.infer<typeof StorageProviderSchema>;
export type OperationalRecord = z.infer<typeof OperationalRecordSchema>;
