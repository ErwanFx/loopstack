import { readFileSync } from "node:fs";
import { z } from "zod";
import { HandoffSchema, LoopDefinitionSchema } from "../src/domain/schemas.js";

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, nested]) => [key, sortKeys(nested)]),
    );
  }
  return value;
}

function expected(schema: z.ZodType): string {
  return `${JSON.stringify(sortKeys(z.toJSONSchema(schema, { target: "draft-2020-12" })), null, 2)}\n`;
}

for (const [name, schema] of [
  ["loop", LoopDefinitionSchema],
  ["handoff", HandoffSchema],
] as const) {
  const path = `schemas/${name}.schema.json`;
  if (readFileSync(path, "utf8") !== expected(schema)) {
    throw new Error(`${path} is stale; run npm run schema:export`);
  }
}

console.log("Schema exports are synchronized.");
