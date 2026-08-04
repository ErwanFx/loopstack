import type { LoopRegistry, OperationalLoopSummary } from "../operations/registry.js";
import { loadRegistryDocument } from "./document-loader.js";

export function findLoop(registry: LoopRegistry, id: string): OperationalLoopSummary | null {
  return registry.loops.find((loop) => loop.id === id) ?? null;
}

export function runShowCommand(args: readonly string[]): number {
  const [path, id] = args;
  if (!path || !id) return 2;
  try {
    const loop = findLoop(loadRegistryDocument(path), id);
    if (!loop) return 2;
    console.log(JSON.stringify(loop, null, 2));
    return 0;
  } catch (error) {
    console.error(JSON.stringify({ code: "INVALID_REGISTRY_FILE", message: error instanceof Error ? error.message : String(error) }));
    return 2;
  }
}
