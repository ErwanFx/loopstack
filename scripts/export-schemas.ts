import { mkdirSync, writeFileSync } from "node:fs";
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

function writeSchema(name: string, schema: z.ZodType): void {
  const jsonSchema = z.toJSONSchema(schema, { target: "draft-2020-12" });
  writeFileSync(`schemas/${name}.schema.json`, `${JSON.stringify(sortKeys(jsonSchema), null, 2)}\n`);
}

mkdirSync("schemas", { recursive: true });
writeSchema("loop", LoopDefinitionSchema);
writeSchema("handoff", HandoffSchema);
