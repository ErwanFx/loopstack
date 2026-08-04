import { readFileSync } from "node:fs";
import { parse } from "yaml";
import { compilePromptGraph, GraphCompileError } from "../graph/compiler.js";

export type GraphValidationEnvelope = {
  valid: boolean;
  topologyHash?: string;
  warnings: Array<{ code: string; message: string; from: string; to: string }>;
  errors: Array<{ code: string; message: string; nodeId?: string; edgeIndex?: number; path?: string }>;
};

function readGraph(path: string): unknown {
  return parse(readFileSync(path, "utf8"));
}

export function validateGraphFile(path: string): GraphValidationEnvelope {
  try {
    const compiled = compilePromptGraph(readGraph(path));
    return {
      valid: true,
      topologyHash: compiled.topologyHash,
      warnings: [...compiled.warnings],
      errors: [],
    };
  } catch (error) {
    if (error instanceof GraphCompileError) {
      return { valid: false, warnings: [], errors: [...error.issues] };
    }
    throw error;
  }
}

export function inspectGraphFile(path: string) {
  const compiled = compilePromptGraph(readGraph(path));
  return {
    valid: true as const,
    id: compiled.definition.id,
    loopId: compiled.definition.loopId,
    version: compiled.definition.version,
    executionMode: compiled.definition.executionMode,
    entrypoint: compiled.definition.entrypoint,
    nodeCount: compiled.definition.nodes.length,
    edgeCount: compiled.definition.edges.length,
    agents: compiled.definition.agents.map((agent) => ({
      id: agent.id,
      ...(agent.profile === undefined ? {} : { profile: agent.profile }),
      sessionPolicy: agent.sessionPolicy,
      maxConcurrency: agent.maxConcurrency,
    })),
    anchors: compiled.definition.anchors,
    budgets: compiled.definition.budgets,
    warnings: compiled.warnings,
    topologyHash: compiled.topologyHash,
  };
}

export function runGraphCommand(args: readonly string[]): number {
  const [action, path] = args;
  if ((action !== "validate" && action !== "inspect") || path === undefined) {
    console.error(JSON.stringify({ code: "INVALID_ARGUMENT", message: "Use graph validate <graph.yaml> or graph inspect <graph.yaml>" }));
    return 2;
  }
  try {
    const result = action === "validate" ? validateGraphFile(path) : inspectGraphFile(path);
    console.log(JSON.stringify(result, null, 2));
    return "valid" in result && result.valid ? 0 : 2;
  } catch (error) {
    const envelope = error instanceof GraphCompileError
      ? { valid: false, warnings: [], errors: error.issues }
      : { code: "INVALID_GRAPH_FILE", message: error instanceof Error ? error.message : String(error) };
    console.error(JSON.stringify(envelope, null, 2));
    return 2;
  }
}
