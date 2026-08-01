import { z } from "zod";
import { StorageProviderSchema } from "./schema.js";

export const NativeCapabilitySchema = z.object({
  provider: StorageProviderSchema,
  runtime: z.enum(["hermes", "claude-code"]),
  capability: z.object({
    kind: z.enum(["mcp", "cli", "skill", "tool"]),
    name: z.string().min(1),
  }),
  authenticated: z.boolean(),
  permissions: z.object({
    read: z.boolean(),
    schemaWrite: z.boolean(),
  }),
  checkedAt: z.iso.datetime(),
  evidence: z.string().min(1),
  alertChannelTested: z.boolean(),
});

export type NativeCapability = z.infer<typeof NativeCapabilitySchema>;
