import { LoopDefinitionSchema } from "./schemas.js";
import type { LoopDefinition } from "./types.js";

/** Parse legacy or v3 input into a safe, disabled Loop Definition v3 value. */
export function normalizeLoopDefinition(input: unknown): LoopDefinition {
  return LoopDefinitionSchema.parse(input);
}
