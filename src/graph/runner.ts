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
  if (typeof dependencies.runnerId !== "string" || dependencies.runnerId.length === 0) {
    throw new Error("runnerId is required");
  }
  if (!/^[a-f0-9]{64}$/.test(input.runContractHash)
    || !/^[a-f0-9]{64}$/.test(input.inputSnapshotHash)) {
    throw new Error("runContractHash and inputSnapshotHash must be lowercase SHA-256 hashes");
  }
  if (dependencies.leaseSeconds !== undefined
    && (!Number.isFinite(dependencies.leaseSeconds) || dependencies.leaseSeconds <= 0)) {
    throw new Error("leaseSeconds must be positive");
  }
  const existing = await dependencies.store.load(input.runId);
  if (existing !== null && existing.topologyHash !== graph.topologyHash) {
    const changed = cloneCheckpoint(existing);
    changed.phase = "terminal";
    changed.status = "escalated";
    changed.reasonCode = "TOPOLOGY_CHANGED";
    changed.reason = "The graph topology changed after this run was checkpointed";
    changed.updatedAt = now().toISOString();
    return outputFor(changed);
  }
  if (existing !== null && (
    existing.graphId !== graph.definition.id
    || existing.graphVersion !== graph.definition.version
    || existing.loopId !== graph.definition.loopId
    || existing.runId !== input.runId
    || existing.workItemId !== input.workItemId
    || existing.runContractHash !== input.runContractHash
    || (!["waiting-human", "waiting-external"].includes(existing.status)
      && existing.inputSnapshotHash !== input.inputSnapshotHash)
  )) {
    const mismatched = cloneCheckpoint(existing);
    mismatched.phase = "terminal";
    mismatched.status = "escalated";
    mismatched.reasonCode = "CHECKPOINT_MISMATCH";
    mismatched.reason = "Checkpoint identity does not match the immutable run contract";
    mismatched.updatedAt = now().toISOString();
    return outputFor(mismatched);
  }
  if (existing !== null && ["completed", "failed", "escalated"].includes(existing.status)) {
    return outputFor(existing);
  }
  if (existing !== null && (existing.status === "waiting-human" || existing.status === "waiting-external")) {
    if (input.resumeCapabilityId === undefined) return outputFor(existing);
    const expectedResume = {
      graphId: existing.graphId, graphVersion: existing.graphVersion, topologyHash: existing.topologyHash,
      loopId: existing.loopId, runId: existing.runId, workItemId: existing.workItemId,
      nodeId: existing.currentNodeId!, waitStatus: existing.status,
      checkpointRevision: existing.revision, oldSnapshotHash: existing.inputSnapshotHash,
      newSnapshotHash: input.inputSnapshotHash, runContractHash: existing.runContractHash,
    };
    const capability = await dependencies.resumeCapabilities?.consume(
      input.resumeCapabilityId, expectedResume, now().toISOString(),
    ) ?? null;
    const issuedAt = capability === null ? Number.NaN : Date.parse(capability.issuedAt);
    const expiresAt = capability === null ? Number.NaN : Date.parse(capability.expiresAt);
    const resumeNow = now().getTime();
    if (capability === null
      || capability.id !== input.resumeCapabilityId
      || capability.graphId !== existing.graphId
      || capability.graphVersion !== existing.graphVersion
      || capability.topologyHash !== existing.topologyHash
      || capability.loopId !== existing.loopId
      || capability.runId !== existing.runId
      || capability.workItemId !== existing.workItemId
      || capability.nodeId !== existing.currentNodeId
      || capability.waitStatus !== existing.status
      || capability.checkpointRevision !== existing.revision
      || capability.oldSnapshotHash !== existing.inputSnapshotHash
      || capability.newSnapshotHash !== input.inputSnapshotHash
      || capability.runContractHash !== existing.runContractHash
      || !Number.isFinite(issuedAt)
      || !Number.isFinite(expiresAt)
      || issuedAt > resumeNow
      || expiresAt <= resumeNow) {
      const mismatched = cloneCheckpoint(existing);
      mismatched.phase = "terminal";
      mismatched.status = "escalated";
      mismatched.reasonCode = "CHECKPOINT_MISMATCH";
      mismatched.reason = "Resume capability does not match the exact waiting checkpoint";
      mismatched.updatedAt = now().toISOString();
      return outputFor(mismatched);
    }
  }

  const timestamp = now().toISOString();
  const checkpoint: GraphCheckpoint = existing === null ? {
    revision: 0,
    graphId: graph.definition.id,
    graphVersion: graph.definition.version,
    topologyHash: graph.topologyHash,
    loopId: graph.definition.loopId,
    runId: input.runId,
    workItemId: input.workItemId,
    runContractHash: input.runContractHash,
    inputSnapshotHash: input.inputSnapshotHash,
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
  // A durable store must have the revision-zero checkpoint before it can
  // attach a claim to that revision.  In-memory stores historically treated
  // a missing checkpoint as revision zero, which hid this production-store
  // invariant.
  if (existing === null) await dependencies.store.save(cloneCheckpoint(checkpoint));
  if (existing !== null && input.resumeCapabilityId !== undefined) {
    checkpoint.inputSnapshotHash = input.inputSnapshotHash;
  }

  if (existing?.phase === "before-node" && existing.currentNodeId !== undefined) {
    const interrupted = graph.nodes.get(existing.currentNodeId);
    if (existing.status === "running" && interrupted?.sideEffect === "consequential") {
      checkpoint.phase = "terminal";
      checkpoint.status = "escalated";
      checkpoint.reasonCode = "SIDE_EFFECT_UNKNOWN";
      checkpoint.reason = `Consequential node ${interrupted.id} was interrupted before its side effect was reconciled`;
      checkpoint.updatedAt = now().toISOString();
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
    const terminalNodeId = "__terminal__";
    const terminalClaim = await dependencies.store.claimNode(
      input.runId, terminalNodeId, checkpoint.revision, dependencies.runnerId,
      new Date(now().getTime() + (dependencies.leaseSeconds ?? 60) * 1000).toISOString(),
    );
    if (terminalClaim === null) {
      const claimed = cloneCheckpoint(checkpoint);
      claimed.phase = "terminal";
      claimed.status = "escalated";
      claimed.reasonCode = "RUN_CLAIMED";
      claimed.reason = "Terminal checkpoint is claimed by another runner";
      return outputFor(claimed);
    }
    checkpoint.phase = "terminal";
    checkpoint.status = status;
    checkpoint.currentNodeId = terminalNodeId;
    checkpoint.reason = reason;
    checkpoint.reasonCode = reasonCode;
    checkpoint.updatedAt = now().toISOString();
    return outputFor(await dependencies.store.saveAfterNode(
      cloneCheckpoint(checkpoint), checkpoint.revision, terminalClaim,
    ));
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
    const leaseUntil = new Date(now().getTime() + (dependencies.leaseSeconds ?? 60) * 1000).toISOString();
    const claimToken = await dependencies.store.claimNode(
      input.runId,
      node.id,
      checkpoint.revision,
      dependencies.runnerId,
      leaseUntil,
    );
    if (claimToken === null) {
      const claimed = cloneCheckpoint(checkpoint);
      claimed.phase = "terminal";
      claimed.status = "escalated";
      claimed.reasonCode = "RUN_CLAIMED";
      claimed.reason = `Node ${node.id} is claimed by another runner`;
      return outputFor(claimed);
    }
    const terminateClaimed = async (
      status: Exclude<GraphRunStatus, "running">,
      reason: string,
      reasonCode?: GraphRunReasonCode,
    ): Promise<GraphRunOutcome> => {
      checkpoint.phase = "terminal";
      checkpoint.status = status;
      checkpoint.currentNodeId = node.id;
      checkpoint.reason = reason;
      checkpoint.reasonCode = reasonCode;
      checkpoint.updatedAt = now().toISOString();
      const saved = await dependencies.store.saveAfterNode(
        cloneCheckpoint(checkpoint), checkpoint.revision, claimToken,
      );
      checkpoint.revision = saved.revision;
      return outputFor(saved);
    };
    checkpoint.nodeAttempts[node.id] = attempt;
    checkpoint.phase = "before-node";
    checkpoint.currentNodeId = node.id;
    checkpoint.updatedAt = now().toISOString();

    let result: import("./runtime-types.js").GraphNodeExecutionResult | null = null;
    let nodeIdempotencyKey: string | undefined;
    const expectedRequestId = `${input.runId}:${checkpoint.step + 1}:${node.id}:${attempt}`;
    const leaseSeconds = dependencies.leaseSeconds ?? 60;
    let renewalFailed = false;
    let renewalInFlight: Promise<void> = Promise.resolve();
    const renew = () => {
      renewalInFlight = renewalInFlight.then(async () => {
        const renewedUntil = new Date(now().getTime() + leaseSeconds * 1000).toISOString();
        if (!await dependencies.store.renewClaim(claimToken, checkpoint.revision, renewedUntil)) renewalFailed = true;
      }).catch(() => { renewalFailed = true; });
    };
    const interval = (dependencies.setInterval ?? globalThis.setInterval)(renew, Math.max(1, leaseSeconds * 1000 / 3));
    const stopHeartbeat = async () => {
      if (dependencies.clearInterval !== undefined) dependencies.clearInterval(interval);
      else globalThis.clearInterval(interval as ReturnType<typeof globalThis.setInterval>);
      await renewalInFlight;
    };
    try {
      const resolvedIdempotencyValue = node.idempotencyKeyRef === undefined
        ? undefined
        : valueAtPath({ state: checkpoint.state, artifacts: checkpoint.artifacts }, node.idempotencyKeyRef);
      if (node.idempotencyKeyRef !== undefined && (typeof resolvedIdempotencyValue !== "string" || resolvedIdempotencyValue.length === 0)) {
        return terminateClaimed("failed", `Node ${node.id} has an unresolved idempotencyKeyRef`, "NODE_FAILED");
      }
      nodeIdempotencyKey = typeof resolvedIdempotencyValue === "string"
        ? resolvedIdempotencyValue
        : undefined;
      const request = Object.freeze<import("./runtime-types.js").GraphNodeExecutionRequest>({
        requestId: expectedRequestId,
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
        ...(nodeIdempotencyKey === undefined ? {} : { idempotencyKey: nodeIdempotencyKey }),
      });
      if (node.timeoutSeconds === undefined) {
        result = await dependencies.executor.execute(request);
      } else {
        const timeoutSeconds: number = node.timeoutSeconds;
        const schedule = dependencies.setTimeout ?? globalThis.setTimeout;
        const execution = dependencies.executor.execute(request);
        let handle: unknown;
        const raced = await Promise.race([
          execution.then((value) => ({ kind: "result" as const, value })),
          new Promise<{ kind: "timeout" }>((resolve) => {
            handle = schedule(() => resolve({ kind: "timeout" }), timeoutSeconds * 1000);
          }),
        ]);
        if (handle !== undefined) {
          if (dependencies.clearTimeout !== undefined) dependencies.clearTimeout(handle);
          else globalThis.clearTimeout(handle as ReturnType<typeof globalThis.setTimeout>);
        }
        if (raced.kind === "timeout") {
          if (node.sideEffect !== "consequential") throw new Error("NODE_TIMEOUT");
          // Safety over availability: keep the claim heartbeat and await reconciliation.
          result = await execution;
          await stopHeartbeat();
          const timeoutEffectResolved = result.requestId === expectedRequestId
            && result.sideEffectState === "confirmed"
            && typeof result.effectEvidenceId === "string"
            && nodeIdempotencyKey !== undefined
            && dependencies.effectTrustResolver !== undefined
            && await dependencies.effectTrustResolver.consume(result.effectEvidenceId, {
              requestId: expectedRequestId, graphId: graph.definition.id, graphVersion: graph.definition.version,
              topologyHash: graph.topologyHash, loopId: graph.definition.loopId, runId: input.runId,
              workItemId: input.workItemId, nodeId: node.id, idempotencyKey: nodeIdempotencyKey,
            }, now().toISOString());
          return terminateClaimed(
            "escalated",
            timeoutEffectResolved
              ? `Consequential node ${node.id} timed out after its in-flight effect was reconciled`
              : `Consequential node ${node.id} timed out with an unreconciled effect`,
            timeoutEffectResolved ? "NODE_TIMEOUT" : "SIDE_EFFECT_UNKNOWN",
          );
        }
        result = raced.value;
      }
      await stopHeartbeat();
      if (renewalFailed) {
        return terminateClaimed("escalated", `Node ${node.id} lost its execution lease`, "RUN_CLAIMED");
      }
    } catch (error) {
      await stopHeartbeat();
      if (error instanceof Error && error.message === "NODE_TIMEOUT") {
        if (node.sideEffect === "consequential") {
          return terminateClaimed("escalated", `Consequential node ${node.id} timed out with an unknown side effect`, "SIDE_EFFECT_UNKNOWN");
        }
        return terminateClaimed("failed", `Node ${node.id} timed out`, "NODE_TIMEOUT");
      }
      if (node.sideEffect === "consequential") {
        return terminateClaimed("escalated", `Consequential node ${node.id} failed with an unknown side effect`, "SIDE_EFFECT_UNKNOWN");
      }
      if (attempt <= graph.definition.budgets.maxRetriesPerNode) {
        await dependencies.store.releaseNode(input.runId, node.id, claimToken);
        enqueue(checkpoint, node.id);
        continue;
      }
      const reason = error instanceof Error ? error.message : String(error);
      return terminateClaimed("failed", `Node ${node.id} failed: ${reason}`, "NODE_FAILED");
    }

    if (result === null
      || result.requestId !== expectedRequestId
      || !["completed", "wait-human", "wait-external", "failed"].includes(result.status)
      || (result.sideEffectState !== undefined
        && !["none", "confirmed", "unknown"].includes(result.sideEffectState))
      || !Number.isFinite(result.cost)
      || result.cost < 0) {
      return terminateClaimed("failed", `Node ${node.id} returned an invalid cost`, "NODE_FAILED");
    }
    checkpoint.step += 1;
    checkpoint.accumulatedCost += result.cost;
    if (node.sideEffect === "consequential") {
      const effectVerified = result.sideEffectState === "confirmed"
        && typeof result.effectEvidenceId === "string"
        && result.effectEvidenceId.length > 0
        && nodeIdempotencyKey !== undefined
        && dependencies.effectTrustResolver !== undefined
        && await dependencies.effectTrustResolver.consume(result.effectEvidenceId, {
          requestId: expectedRequestId, graphId: graph.definition.id, graphVersion: graph.definition.version,
          topologyHash: graph.topologyHash, loopId: graph.definition.loopId, runId: input.runId,
          workItemId: input.workItemId, nodeId: node.id, idempotencyKey: nodeIdempotencyKey,
        }, now().toISOString());
      if (!effectVerified) {
        return terminateClaimed("escalated", `Node ${node.id} has an unreconciled side effect`, "SIDE_EFFECT_UNKNOWN");
      }
    }
    if (result.sideEffectState === "unknown") {
      return terminateClaimed("escalated", `Node ${node.id} has an unreconciled side effect`, "SIDE_EFFECT_UNKNOWN");
    }
    if (checkpoint.accumulatedCost > graph.definition.budgets.maxCost) {
      return terminateClaimed("escalated", "Maximum graph cost reached", "MAX_COST");
    }
    if (result.status === "wait-human" || result.status === "wait-external") {
      if (node.sideEffect === "consequential" && result.sideEffectState === "confirmed") {
        return terminateClaimed("escalated", `Consequential node ${node.id} cannot wait after a confirmed effect`, "SIDE_EFFECT_UNKNOWN");
      }
      enqueue(checkpoint, node.id);
      checkpoint.phase = "before-node";
      checkpoint.status = result.status === "wait-human" ? "waiting-human" : "waiting-external";
      checkpoint.currentNodeId = node.id;
      checkpoint.updatedAt = now().toISOString();
      const saved = await dependencies.store.saveAfterNode(
        cloneCheckpoint(checkpoint), checkpoint.revision, claimToken,
      );
      checkpoint.revision = saved.revision;
      return outputFor(saved);
    }
    if (result.status === "failed") {
      return terminateClaimed("failed", result.error ?? `Node ${node.id} failed`, "NODE_FAILED");
    }

    const resultArtifacts = result.artifacts ?? {};
    const undeclared = Object.keys(resultArtifacts).filter((artifact) => !node.outputs.includes(artifact));
    if (undeclared.length > 0) {
      return terminateClaimed(
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
        return terminateClaimed(
          "failed",
          `Node ${node.id} did not produce required artifact ${edge.artifact}`,
          "ARTIFACT_CONTRACT_VIOLATION",
        );
      }
    }
    for (const edge of graph.outgoing.get(node.id) ?? []) {
      const index = graph.definition.edges.indexOf(edge);
      const key = edgeKey(edge, index);
      const traversals = checkpoint.edgeTraversals[key] ?? 0;
      if (!conditionMatches(edge.when, checkpoint.state, checkpoint.artifacts)) continue;
      if (edge.maxTraversals !== undefined && traversals >= edge.maxTraversals) {
        return terminateClaimed(
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
    checkpoint.phase = "after-node";
    checkpoint.currentNodeId = node.id;
    checkpoint.updatedAt = now().toISOString();
    const savedAfterNode = await dependencies.store.saveAfterNode(
      cloneCheckpoint(checkpoint),
      checkpoint.revision,
      claimToken,
    );
    checkpoint.revision = savedAfterNode.revision;
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
