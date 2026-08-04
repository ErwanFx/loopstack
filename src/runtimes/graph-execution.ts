import { compilePromptGraph } from "../graph/compiler.js";
import type { PromptGraphDefinition } from "../graph/types.js";
import type { RuntimeGraphCapabilities, RuntimeGraphExecution, RuntimeName } from "./types.js";

export function renderGraphExecution(
  definition: PromptGraphDefinition,
  runtime: RuntimeName,
  loopId: string,
  capabilities: RuntimeGraphCapabilities,
): { execution: RuntimeGraphExecution; graphFile: string } {
  const graph = compilePromptGraph(definition);
  if (graph.definition.loopId !== loopId) {
    throw new Error(`Graph loopId ${graph.definition.loopId} does not match loop ${loopId}`);
  }
  for (const binding of graph.definition.agents) {
    if (binding.runtime !== "portable" && binding.runtime !== runtime) {
      throw new Error(`Agent ${binding.id} is bound to ${binding.runtime}, not ${runtime}`);
    }
  }
  const effectiveConcurrency = runtime === "hermes"
    ? 1
    : Math.min(capabilities.maxConcurrency, graph.definition.budgets.maxConcurrency);
  return {
    execution: {
      schemaVersion: 1,
      graphId: graph.definition.id,
      graphVersion: graph.definition.version,
      topologyHash: graph.topologyHash,
      executionMode: graph.definition.executionMode,
      entrypoint: graph.definition.entrypoint,
      checkpointing: "before-and-after-node",
      agentBindings: graph.definition.agents.map((binding) => ({
        id: binding.id,
        ...(binding.profile === undefined ? {} : { profile: binding.profile }),
        sessionPolicy: binding.sessionPolicy,
        maxConcurrency: Math.min(binding.maxConcurrency, effectiveConcurrency),
        requiredSkills: [...binding.requiredSkills],
        requiredTools: [...binding.requiredTools],
      })),
      capabilities: { ...capabilities, maxConcurrency: effectiveConcurrency },
    },
    graphFile: `${JSON.stringify(graph.definition, null, 2)}\n`,
  };
}
