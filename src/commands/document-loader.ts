import { readFileSync } from "node:fs";
import { extname } from "node:path";
import { parse } from "yaml";
import { z } from "zod";
import { LoopDefinitionSchema } from "../domain/schemas.js";
import type { ReadinessCandidate } from "../domain/readiness.js";
import type { LoopRegistry } from "../operations/registry.js";

const RuntimeNameSchema = z.enum(["hermes", "claude-code", "codex"]);
const RegistrySchema = z.object({
  generatedAt: z.string().datetime().nullable(),
  loops: z.array(z.object({
    id: z.string().min(1),
    name: z.string().min(1),
    status: z.enum(["idea", "qualifying", "blocked", "designing", "planned", "awaiting-approval", "building", "qa-failed", "ready", "shadow", "canary", "active", "paused", "degraded", "failed", "inactive", "archived"]),
    runtime: RuntimeNameSchema,
    storage: z.enum(["convex", "airtable", "google-sheets"]),
    version: z.number().int().nonnegative(),
    health: z.enum(["healthy", "stale", "degraded", "failed", "unknown"]),
    lastRunAt: z.string().datetime().nullable(),
    openAlerts: z.number().int().nonnegative(),
    pendingApprovals: z.number().int().nonnegative(),
    targetMetric: z.string().min(1),
    latestGap: z.number().finite().nullable(),
    registration: z.enum(["registered", "unregistered"]),
  }).strict()),
}).strict();

const EnvelopeSchema = z.object({
  classificationHints: z.record(z.string(), z.unknown()).optional(),
  loop: LoopDefinitionSchema,
  readiness: z.record(z.string(), z.unknown()).optional(),
  tools: z.array(z.string().min(1)).optional(),
}).strict();

export type LoadedLoopDocument = {
  loop: z.infer<typeof LoopDefinitionSchema>;
  classificationHints?: Record<string, unknown>;
  readiness?: ReadinessCandidate;
  tools: string[];
  shape: "official-v3" | "envelope";
};

function readStructured(path: string): unknown {
  const text = readFileSync(path, "utf8");
  if (extname(path).toLowerCase() === ".json") return JSON.parse(text);
  return parse(text);
}

function formatIssues(label: string, error: z.ZodError): Error {
  return new Error(error.issues.map((issue) => `${label}.${issue.path.join(".") || "document"}: ${issue.message}`).join("; "));
}

export function loadLoopDocument(path: string): LoadedLoopDocument {
  const raw = readStructured(path);
  const official = LoopDefinitionSchema.safeParse(raw);
  if (official.success) return { loop: official.data, tools: [], shape: "official-v3" };
  const envelope = EnvelopeSchema.safeParse(raw);
  if (!envelope.success) throw formatIssues("loop", envelope.error);
  return {
    loop: envelope.data.loop,
    tools: envelope.data.tools ?? [],
    shape: "envelope",
    ...(envelope.data.classificationHints === undefined ? {} : { classificationHints: envelope.data.classificationHints }),
    ...(envelope.data.readiness === undefined ? {} : { readiness: envelope.data.readiness as ReadinessCandidate }),
  };
}

export function loadRegistryDocument(path: string): LoopRegistry {
  const parsed = RegistrySchema.safeParse(readStructured(path));
  if (!parsed.success) throw formatIssues("registry", parsed.error);
  return parsed.data;
}

export function loadStructuredDocument(path: string): unknown {
  return readStructured(path);
}
