import { readFileSync } from "node:fs";
import type { LoopRegistry } from "../operations/registry.js";

export function formatLoopList(registry: LoopRegistry): string {
  return registry.loops.map((loop) => `${loop.id}\t${loop.status}\t${loop.health}`).join("\n");
}

export function runListCommand(args: readonly string[]): number {
  const path = args[0];
  if (!path) return 2;
  const registry = JSON.parse(readFileSync(path, "utf8")) as LoopRegistry;
  console.log(formatLoopList(registry));
  return 0;
}
