import type { LoopRegistry } from "../operations/registry.js";
import { loadRegistryDocument } from "./document-loader.js";

export function formatLoopList(registry: LoopRegistry): string {
  return registry.loops.map((loop) => `${loop.id}\t${loop.status}\t${loop.health}`).join("\n");
}

export function runListCommand(args: readonly string[]): number {
  const path = args[0];
  if (!path) {
    console.error(JSON.stringify({ code: "INVALID_ARGUMENT", message: "Provide a registry file path" }));
    return 2;
  }
  try {
    console.log(formatLoopList(loadRegistryDocument(path)));
    return 0;
  } catch (error) {
    console.error(JSON.stringify({ code: "INVALID_REGISTRY_FILE", message: error instanceof Error ? error.message : String(error) }));
    return 2;
  }
}
