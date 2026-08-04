import type { CompiledPromptGraph, GraphCondition, PromptGraphEdge, PromptGraphNode } from "./types.js";
import type {
  GraphCheckpoint,
  GraphRunInput,
  GraphRunOutcome,
  GraphRunReasonCode,
  GraphRunStatus,
  GraphRunnerDependencies,
} from "./runtime-types.js";

function edgeKey(edge: PromptGraphEdge, index: number): string {
  return `${edge.from}->${edge.to}#${index}`;
}

function valueAtPath(root: unknown, path: string): unknown {
  return path.split(".").reduce<unknown>((current, part) => {
    if (current === null || typeof current !== "object") return undefined;
    return (current as Record<string, unknown>)[part];
  }, root);
}

function conditionMatches(
  condition: GraphCondition | undefined,
  state: Readonly<Record<string, unknown>>,
  artifacts: Readonly<Record<string, unknown>>,
): boolean {
  if (condition === undefined) return true;
  const actual = valueAtPath({ state, artifacts }, condition.path);
  switch (condition.operator) {
    case "eq": return actual === condition.value;
    case "neq": return actual !== condition.value;
    case "gt": return typeof actual === "number" && typeof condition.value === "number" && actual > condition.value;
    case "gte": return typeof actual === "number" && typeof condition.value === "number" && actual >= condition.value;
    case "lt": return typeof actual === "number" && typeof condition.value === "number" && actual < condition.value;
    case "lte": return typeof actual === "number" && typeof condition.value === "number" && actual <= condition.value;
    case "in": return Array.isArray(condition.value) && condition.value.includes(actual);
    case "exists": return actual !== undefined;
    case "not-exists": return actual === undefined;
  }
}

function outputFor(checkpoint: GraphCheckpoint): GraphRunOutcome {
  if (checkpoint.status === "running") throw new Error("A running checkpoint is not an outcome");
  return {
    status: checkpoint.status,
    runId: checkpoint.runId,
    workItemId: checkpoint.workItemId,
    step: checkpoint.step,
    accumulatedCost: checkpoint.accumulatedCost,
    artifacts: Object.freeze({ ...checkpoint.artifacts }),
    state: Object.freeze({ ...checkpoint.state }),
    edgeTraversals: Object.freeze({ ...checkpoint.edgeTraversals }),
    ...(checkpoint.reason === undefined ? {} : { reason: checkpoint.reason }),
    ...(checkpoint.reasonCode === undefined ? {} : { reasonCode: checkpoint.reasonCode }),
  };
}

function inputsFor(node: PromptGraphNode, artifacts: Readonly<Record<string, unknown>>): Record<string, unknown> {
  return Object.fromEntries(node.inputs
    .filter((artifact) => Object.hasOwn(artifacts, artifact))
    .map((artifact) => [artifact, artifacts[artifact]]));
}

function enqueue(checkpoint: GraphCheckpoint, nodeId: string): void {
  if (!checkpoint.readyNodeIds.includes(nodeId)) checkpoint.readyNodeIds.push(nodeId);
}

function joinReady(graph: CompiledPromptGraph, checkpoint: GraphCheckpoint, node: PromptGraphNode): boolean {
  if (node.kind !== "join") return true;
  const incoming = graph.incoming.get(node.id) ?? [];
  const triggered = new Set(checkpoint.triggeredIncomingEdges[node.id] ?? []);
  if (node.activation === "any") {
    const minimum = node.minimumInputs ?? 1;
    return triggered.size >= Math.min(minimum, incoming.length);
  }
  return incoming.length > 0 && incoming.every((edge) => {
    const index = graph.definition.edges.indexOf(edge);
    return triggered.has(edgeKey(edge, index));
  });
}

function cloneCheckpoint(checkpoint: GraphCheckpoint): GraphCheckpoint {
  return {
    ...checkpoint,
    readyNodeIds: [...checkpoint.readyNodeIds],
    artifacts: { ...checkpoint.artifacts },
    state: { ...checkpoint.state },
    nodeAttempts: { ...checkpoint.nodeAttempts },
    edgeTraversals: { ...checkpoint.edgeTraversals },
    triggeredIncomingEdges: Object.fromEntries(Object.entries(checkpoint.triggeredIncomingEdges)
      .map(([nodeId, edges]) => [nodeId, [...edges]])),
  };
}

export async function runPromptGraph(
  graph: CompiledPromptGraph,
  input: GraphRunInput,
  dependencies: GraphRunnerDependencies,
): Promise<GraphRunOutcome> {
  const now = dependencies.now ?? (() => new Date());
  const existing = await dependencies.store.load(input.runId);
  if (existing !== null && existing.topologyHash !== graph.topologyHash) {
    const changed = cloneCheckpoint(existing);
    changed.phase = "terminal";
    changed.status = "escalated";
    changed.reasonCode = "TOPOLOGY_CHANGED";
    changed.reason = "The graph topology changed after this run was checkpointed";
    changed.updatedAt = now().toISOString();
    await dependencies.store.save(changed);
    return outputFor(changed);
  }
  if (existing !== null && ["completed", "failed", "escalated"].includes(existing.status)) {
    return outputFor(existing);
  }

  const timestamp = now().toISOString();
  const checkpoint: GraphCheckpoint = existing === null ? {
    graphId: graph.definition.id,
    graphVersion: graph.definition.version,
    topologyHash: graph.topologyHash,
    loopId: graph.definition.loopId,
    runId: input.runId,
    workItemId: input.workItemId,
    phase: "after-node",
    status: "running",
    readyNodeIds: [graph.definition.entrypoint],
    step: 0,
    accumulatedCost: 0,
    artifacts: { ...input.initialArtifacts },
    state: { ...input.initialState },
    nodeAttempts: {},
    edgeTraversals: {},
    triggeredIncomingEdges: {},
    startedAt: timestamp,
    updatedAt: timestamp,
  } : cloneCheckpoint(existing);

  if (existing?.phase === "before-node" && existing.currentNodeId !== undefined) {
    const interrupted = graph.nodes.get(existing.currentNodeId);
    if (existing.status === "running" && interrupted?.sideEffect === "consequential") {
      checkpoint.phase = "terminal";
      checkpoint.status = "escalated";
      checkpoint.reasonCode = "SIDE_EFFECT_UNKNOWN";
      checkpoint.reason = `Consequential node ${interrupted.id} was interrupted before its side effect was reconciled`;
      checkpoint.updatedAt = now().toISOString();
      await dependencies.store.save(checkpoint);
      return outputFor(checkpoint);
    }
    enqueue(checkpoint, existing.currentNodeId);
  }
  checkpoint.status = "running";

  const deadlineMs = dependencies.deadline === undefined
    ? Date.parse(checkpoint.startedAt) + graph.definition.budgets.maxDurationSeconds * 1000
    : Date.parse(dependencies.deadline);

  const terminate = async (
    status: Exclude<GraphRunStatus, "running">,
    reason: string,
    reasonCode?: GraphRunReasonCode,
  ): Promise<GraphRunOutcome> => {
    checkpoint.phase = "terminal";
    checkpoint.status = status;
    checkpoint.currentNodeId = undefined;
    checkpoint.reason = reason;
    checkpoint.reasonCode = reasonCode;
    checkpoint.updatedAt = now().toISOString();
    await dependencies.store.save(cloneCheckpoint(checkpoint));
    return outputFor(checkpoint);
  };

  while (checkpoint.readyNodeIds.length > 0) {
    if (checkpoint.step >= graph.definition.budgets.maxSteps) {
      return terminate("escalated", "Maximum graph step count reached", "MAX_STEPS");
    }
    if (now().getTime() >= deadlineMs) {
      return terminate("escalated", "Graph execution deadline reached", "DEADLINE");
    }

    const nodeId = checkpoint.readyNodeIds.shift()!;
    const node = graph.nodes.get(nodeId);
    if (node === undefined) return terminate("failed", `Scheduled node ${nodeId} does not exist`, "NODE_FAILED");
    if (node.kind === "join" && !joinReady(graph, checkpoint, node)) continue;

    const attempt = (checkpoint.nodeAttempts[node.id] ?? 0) + 1;
    checkpoint.nodeAttempts[node.id] = attempt;
    checkpoint.phase = "before-node";
    checkpoint.currentNodeId = node.id;
    checkpoint.updatedAt = now().toISOString();
    await dependencies.store.save(cloneCheckpoint(checkpoint));

    let result;
    try {
      result = await dependencies.executor.execute(Object.freeze({
        requestId: `${input.runId}:${checkpoint.step + 1}:${node.id}:${attempt}`,
        graphId: graph.definition.id,
        graphVersion: graph.definition.version,
        topologyHash: graph.topologyHash,
        loopId: graph.definition.loopId,
        runId: input.runId,
        workItemId: input.workItemId,
        step: checkpoint.step + 1,
        attempt,
        node,
        inputs: Object.freeze(inputsFor(node, checkpoint.artifacts)),
        artifacts: Object.freeze({ ...checkpoint.artifacts }),
        state: Object.freeze({ ...checkpoint.state }),
      }));
    } catch (error) {
      if (node.sideEffect === "consequential") {
        return terminate("escalated", `Consequential node ${node.id} failed with an unknown side effect`, "SIDE_EFFECT_UNKNOWN");
      }
      if (attempt <= graph.definition.budgets.maxRetriesPerNode) {
        enqueue(checkpoint, node.id);
        continue;
      }
      const reason = error instanceof Error ? error.message : String(error);
      return terminate("failed", `Node ${node.id} failed: ${reason}`, "NODE_FAILED");
    }

    if (!Number.isFinite(result.cost) || result.cost < 0) {
      return terminate("failed", `Node ${node.id} returned an invalid cost`, "NODE_FAILED");
    }
    checkpoint.step += 1;
    checkpoint.accumulatedCost += result.cost;
    if (result.sideEffectState === "unknown") {
      return terminate("escalated", `Node ${node.id} has an unreconciled side effect`, "SIDE_EFFECT_UNKNOWN");
    }
    if (checkpoint.accumulatedCost >= graph.definition.budgets.maxCost) {
      return terminate("escalated", "Maximum graph cost reached", "MAX_COST");
    }
    if (result.status === "wait-human" || result.status === "wait-external") {
      enqueue(checkpoint, node.id);
      checkpoint.phase = "before-node";
      checkpoint.status = result.status === "wait-human" ? "waiting-human" : "waiting-external";
      checkpoint.currentNodeId = node.id;
      checkpoint.updatedAt = now().toISOString();
      await dependencies.store.save(cloneCheckpoint(checkpoint));
      return outputFor(checkpoint);
    }
    if (result.status === "failed") {
      return terminate("failed", result.error ?? `Node ${node.id} failed`, "NODE_FAILED");
    }

    const resultArtifacts = result.artifacts ?? {};
    const undeclared = Object.keys(resultArtifacts).filter((artifact) => !node.outputs.includes(artifact));
    if (undeclared.length > 0) {
      return terminate(
        "failed",
        `Node ${node.id} returned undeclared artifacts: ${undeclared.join(", ")}`,
        "ARTIFACT_CONTRACT_VIOLATION",
      );
    }
    Object.assign(checkpoint.artifacts, resultArtifacts);
    Object.assign(checkpoint.state, result.stateUpdate ?? {});
    for (const edge of graph.outgoing.get(node.id) ?? []) {
      if (edge.type !== "data" || edge.artifact === undefined) continue;
      if (!conditionMatches(edge.when, checkpoint.state, checkpoint.artifacts)) continue;
      if (!Object.hasOwn(checkpoint.artifacts, edge.artifact)) {
        return terminate(
          "failed",
          `Node ${node.id} did not produce required artifact ${edge.artifact}`,
          "ARTIFACT_CONTRACT_VIOLATION",
        );
      }
    }
    checkpoint.phase = "after-node";
    checkpoint.currentNodeId = node.id;
    checkpoint.updatedAt = now().toISOString();
    await dependencies.store.save(cloneCheckpoint(checkpoint));

    for (const edge of graph.outgoing.get(node.id) ?? []) {
      const index = graph.definition.edges.indexOf(edge);
      const key = edgeKey(edge, index);
      const traversals = checkpoint.edgeTraversals[key] ?? 0;
      if (!conditionMatches(edge.when, checkpoint.state, checkpoint.artifacts)) continue;
      if (edge.maxTraversals !== undefined && traversals >= edge.maxTraversals) {
        return terminate(
          "escalated",
          `Edge ${edge.from} -> ${edge.to} reached its traversal limit`,
          "MAX_TRAVERSALS",
        );
      }
      checkpoint.edgeTraversals[key] = traversals + 1;
      const triggered = checkpoint.triggeredIncomingEdges[edge.to] ?? [];
      if (!triggered.includes(key)) triggered.push(key);
      checkpoint.triggeredIncomingEdges[edge.to] = triggered;
      const target = graph.nodes.get(edge.to);
      if (target?.kind === "join" && (checkpoint.nodeAttempts[target.id] ?? 0) > 0) continue;
      if (target !== undefined && joinReady(graph, checkpoint, target)) enqueue(checkpoint, target.id);
    }
  }

  for (const node of graph.nodes.values()) {
    if (node.kind !== "join" || node.activation !== "all") continue;
    const triggered = checkpoint.triggeredIncomingEdges[node.id] ?? [];
    if (triggered.length > 0 && !joinReady(graph, checkpoint, node)) {
      return terminate("failed", `Join ${node.id} did not receive all required inputs`, "FAN_IN_INCOMPLETE");
    }
  }
  return terminate("completed", "Graph execution completed");
}
