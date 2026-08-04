import { createHash } from "node:crypto";
import { PromptGraphDefinitionSchema } from "./schemas.js";
import type {
  CompiledPromptGraph,
  GraphCompileIssue,
  GraphCompileWarning,
  PromptGraphDefinition,
  PromptGraphEdge,
  PromptGraphNode,
} from "./types.js";

export class GraphCompileError extends Error {
  constructor(readonly issues: readonly GraphCompileIssue[]) {
    super(issues.map((issue) => `${issue.code}: ${issue.message}`).join("; "));
    this.name = "GraphCompileError";
  }
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, nested]) => [key, canonicalize(nested)]));
  }
  return value;
}

function topologyHash(definition: PromptGraphDefinition): string {
  return createHash("sha256")
    .update(JSON.stringify(canonicalize(definition)))
    .digest("hex");
}

function isAiNode(node: PromptGraphNode): boolean {
  return node.kind === "agent"
    || node.kind === "skill"
    || (node.kind === "evaluator" && node.mode === "ai");
}

function agentIdFor(node: PromptGraphNode): string | undefined {
  if (node.kind === "agent" || node.kind === "skill") return node.agentId;
  if (node.kind === "evaluator" && node.mode === "ai") return node.agentId;
  return undefined;
}

function makeEdgeMap(
  ids: Iterable<string>,
  edges: readonly PromptGraphEdge[],
  direction: "incoming" | "outgoing",
): Map<string, PromptGraphEdge[]> {
  const result = new Map<string, PromptGraphEdge[]>();
  for (const id of ids) result.set(id, []);
  for (const edge of edges) {
    const key = direction === "outgoing" ? edge.from : edge.to;
    result.get(key)?.push(edge);
  }
  return result;
}

function reachableFrom(
  start: string,
  outgoing: ReadonlyMap<string, readonly PromptGraphEdge[]>,
): Set<string> {
  const seen = new Set<string>();
  const pending = [start];
  while (pending.length > 0) {
    const current = pending.pop()!;
    if (seen.has(current)) continue;
    seen.add(current);
    for (const edge of outgoing.get(current) ?? []) pending.push(edge.to);
  }
  return seen;
}

function hasPath(
  from: string,
  to: string,
  outgoing: ReadonlyMap<string, readonly PromptGraphEdge[]>,
): boolean {
  if (from === to) return true;
  const seen = new Set<string>();
  const pending = [from];
  while (pending.length > 0) {
    const current = pending.pop()!;
    if (seen.has(current)) continue;
    seen.add(current);
    for (const edge of outgoing.get(current) ?? []) {
      if (edge.to === to) return true;
      pending.push(edge.to);
    }
  }
  return false;
}

function stronglyConnectedComponents(
  nodeIds: readonly string[],
  outgoing: ReadonlyMap<string, readonly PromptGraphEdge[]>,
): string[][] {
  let index = 0;
  const stack: string[] = [];
  const onStack = new Set<string>();
  const indexes = new Map<string, number>();
  const lowLinks = new Map<string, number>();
  const components: string[][] = [];

  const visit = (nodeId: string): void => {
    indexes.set(nodeId, index);
    lowLinks.set(nodeId, index);
    index += 1;
    stack.push(nodeId);
    onStack.add(nodeId);

    for (const edge of outgoing.get(nodeId) ?? []) {
      if (!indexes.has(edge.to)) {
        visit(edge.to);
        lowLinks.set(nodeId, Math.min(lowLinks.get(nodeId)!, lowLinks.get(edge.to)!));
      } else if (onStack.has(edge.to)) {
        lowLinks.set(nodeId, Math.min(lowLinks.get(nodeId)!, indexes.get(edge.to)!));
      }
    }

    if (lowLinks.get(nodeId) === indexes.get(nodeId)) {
      const component: string[] = [];
      let member: string;
      do {
        member = stack.pop()!;
        onStack.delete(member);
        component.push(member);
      } while (member !== nodeId);
      components.push(component);
    }
  };

  for (const nodeId of nodeIds) if (!indexes.has(nodeId)) visit(nodeId);
  return components;
}

export function compilePromptGraph(input: unknown): CompiledPromptGraph {
  const parsed = PromptGraphDefinitionSchema.safeParse(input);
  if (!parsed.success) {
    throw new GraphCompileError(parsed.error.issues.map((issue) => ({
      code: "SCHEMA_INVALID" as const,
      message: issue.message,
      path: issue.path.join("."),
    })));
  }

  const definition = parsed.data;
  const issues: GraphCompileIssue[] = [];
  const warnings: GraphCompileWarning[] = [];
  const nodes = new Map<string, PromptGraphNode>();
  const agents = new Map<string, (typeof definition.agents)[number]>();

  for (const agent of definition.agents) {
    if (agents.has(agent.id)) issues.push({
      code: "DUPLICATE_AGENT",
      message: `Agent ${agent.id} is declared more than once`,
    });
    agents.set(agent.id, agent);
  }
  for (const node of definition.nodes) {
    if (nodes.has(node.id)) issues.push({
      code: "DUPLICATE_NODE",
      message: `Node ${node.id} is declared more than once`,
      nodeId: node.id,
    });
    nodes.set(node.id, node);
  }

  if (!nodes.has(definition.entrypoint)) issues.push({
    code: "UNKNOWN_ENTRYPOINT",
    message: `Entrypoint ${definition.entrypoint} does not exist`,
  });

  for (const node of definition.nodes) {
    const agentId = agentIdFor(node);
    if (agentId !== undefined && !agents.has(agentId)) issues.push({
      code: "UNKNOWN_AGENT",
      message: `Node ${node.id} references unknown agent ${agentId}`,
      nodeId: node.id,
    });
    if (node.sideEffect === "consequential") {
      if (node.idempotencyKeyRef === undefined) issues.push({
        code: "MISSING_IDEMPOTENCY",
        message: `Consequential node ${node.id} requires idempotencyKeyRef`,
        nodeId: node.id,
      });
      if (node.resourceLocks.length === 0) issues.push({
        code: "MISSING_RESOURCE_LOCK",
        message: `Consequential node ${node.id} requires a resource lock`,
        nodeId: node.id,
      });
    }
  }

  for (const [edgeIndex, edge] of definition.edges.entries()) {
    const source = nodes.get(edge.from);
    const target = nodes.get(edge.to);
    if (source === undefined || target === undefined) {
      issues.push({
        code: "UNKNOWN_NODE",
        message: `Edge ${edge.from} -> ${edge.to} references an unknown node`,
        edgeIndex,
      });
      continue;
    }
    if (edge.type === "data" && edge.artifact !== undefined
      && (!source.outputs.includes(edge.artifact) || !target.inputs.includes(edge.artifact))) {
      issues.push({
        code: "ARTIFACT_CONTRACT_MISMATCH",
        message: `${edge.artifact} must be produced by ${source.id} and consumed by ${target.id}`,
        edgeIndex,
      });
    }
    if (edge.type === "control" && edge.when === undefined && edge.dependencyReason === undefined) {
      const sharedResource = source.resourceLocks.some((lock) => target.resourceLocks.includes(lock));
      const carriesDeclaredArtifact = source.outputs.some((artifact) => target.inputs.includes(artifact));
      if (!sharedResource && !carriesDeclaredArtifact) warnings.push({
        code: "POTENTIAL_FAKE_EDGE",
        message: `${source.id} -> ${target.id} carries no declared data or resource dependency`,
        from: source.id,
        to: target.id,
      });
    }
  }

  const validEdges = definition.edges.filter((edge) => nodes.has(edge.from) && nodes.has(edge.to));
  const outgoing = makeEdgeMap(nodes.keys(), validEdges, "outgoing");
  const incoming = makeEdgeMap(nodes.keys(), validEdges, "incoming");

  if (nodes.has(definition.entrypoint)) {
    const reachable = reachableFrom(definition.entrypoint, outgoing);
    for (const nodeId of nodes.keys()) if (!reachable.has(nodeId)) issues.push({
      code: "UNREACHABLE_NODE",
      message: `Node ${nodeId} is not reachable from ${definition.entrypoint}`,
      nodeId,
    });
  }

  for (const component of stronglyConnectedComponents([...nodes.keys()], outgoing)) {
    const members = new Set(component);
    const selfLoop = component.length === 1
      && (outgoing.get(component[0]) ?? []).some((edge) => edge.to === component[0]);
    if (component.length === 1 && !selfLoop) continue;
    const cycleEdges = validEdges.filter((edge) => members.has(edge.from) && members.has(edge.to));
    if (!cycleEdges.some((edge) => edge.maxTraversals !== undefined)) issues.push({
      code: "UNBOUNDED_CYCLE",
      message: `Cycle ${component.sort().join(" -> ")} requires a maxTraversals edge`,
    });
  }

  const nodeList = [...nodes.values()];
  for (let leftIndex = 0; leftIndex < nodeList.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < nodeList.length; rightIndex += 1) {
      const left = nodeList[leftIndex];
      const right = nodeList[rightIndex];
      const sharedLocks = left.resourceLocks.filter((lock) => right.resourceLocks.includes(lock));
      if (sharedLocks.length === 0) continue;
      if (!hasPath(left.id, right.id, outgoing) && !hasPath(right.id, left.id, outgoing)) issues.push({
        code: "HIDDEN_RESOURCE_EDGE",
        message: `${left.id} and ${right.id} share ${sharedLocks.join(", ")} without an ordering edge`,
      });
    }
  }

  const improvementNode = nodes.get(definition.improvement.nodeId);
  if (improvementNode === undefined) issues.push({
    code: "UNKNOWN_IMPROVEMENT_NODE",
    message: `Improvement node ${definition.improvement.nodeId} does not exist`,
  });
  if (improvementNode !== undefined && !isAiNode(improvementNode)) issues.push({
    code: "AI_IMPROVEMENT_REQUIRED",
    message: "Improvement must be performed by an AI-bearing node",
    nodeId: improvementNode.id,
  });
  if (definition.anchors.length === 0) issues.push({
    code: "EVIDENCE_ANCHOR_REQUIRED",
    message: "AI improvement requires at least one immutable evidence anchor",
  });
  for (const anchor of definition.anchors) {
    if (!nodes.has(anchor.nodeId)) issues.push({
      code: "UNKNOWN_ANCHOR_NODE",
      message: `Anchor ${anchor.id} references unknown node ${anchor.nodeId}`,
    });
    if (!definition.improvement.protectedNodeIds.includes(anchor.nodeId)) issues.push({
      code: "UNPROTECTED_ANCHOR",
      message: `Anchor node ${anchor.nodeId} must be protected from improvement`,
      nodeId: anchor.nodeId,
    });
  }
  for (const nodeId of definition.improvement.protectedNodeIds) if (!nodes.has(nodeId)) issues.push({
    code: "UNKNOWN_ANCHOR_NODE",
    message: `Protected node ${nodeId} does not exist`,
  });

  const usedAgents = new Set(definition.nodes.map(agentIdFor).filter((id): id is string => id !== undefined));
  if (definition.executionMode === "single-agent-multi-session" && usedAgents.size !== 1) issues.push({
    code: "INVALID_EXECUTION_MODE",
    message: "single-agent-multi-session requires exactly one referenced agent",
  });
  if (definition.executionMode === "multi-agent" && usedAgents.size < 2) issues.push({
    code: "INVALID_EXECUTION_MODE",
    message: "multi-agent requires at least two referenced agents",
  });
  if (definition.executionMode === "deterministic-with-ai-improvement") {
    const operationalAi = definition.nodes.filter((node) => isAiNode(node) && node.id !== definition.improvement.nodeId);
    if (operationalAi.length > 0) issues.push({
      code: "INVALID_EXECUTION_MODE",
      message: "deterministic-with-ai-improvement permits AI only in the improvement node",
    });
  }

  if (issues.length > 0) throw new GraphCompileError(issues);
  return {
    definition,
    nodes,
    agents,
    outgoing,
    incoming,
    warnings,
    topologyHash: topologyHash(definition),
  };
}
