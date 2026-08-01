import { z } from "zod";

export const LoopIdSchema = z
  .string()
  .min(1)
  .max(64)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Use a lowercase hyphenated identifier");

export function assertLoopId(value: unknown): string {
  return LoopIdSchema.parse(value);
}
