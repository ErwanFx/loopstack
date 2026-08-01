import { readFileSync } from "node:fs";
import type { LoopRegistry, OperationalLoopSummary } from "../operations/registry.js";

export function findLoop(registry: LoopRegistry, id: string): OperationalLoopSummary | null {
  return registry.loops.find((loop) => loop.id === id) ?? null;
}

export function runShowCommand(args: readonly string[]): number {
  const [path, id] = args;
  if (!path || !id) return 2;
  const loop = findLoop(JSON.parse(readFileSync(path, "utf8")) as LoopRegistry, id);
  if (!loop) return 2;
  console.log(JSON.stringify(loop, null, 2));
  return 0;
}
