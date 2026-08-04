import { describe, expect, it } from "vitest";
import { readFileSync, writeFileSync } from "node:fs";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { compilePromptGraph } from "../../src/graph/compiler.js";
import { FilesystemGraphCheckpointStore } from "../../src/graph/filesystem-checkpoint-store.js";
import { runPromptGraph } from "../../src/graph/runner.js";
import type {
  GraphCheckpoint,
  GraphCheckpointStore,
  GraphNodeExecutionRequest,
  GraphNodeExecutionResult,
  GraphNodeExecutor,
} from "../../src/graph/runtime-types.js";

class MemoryCheckpointStore implements GraphCheckpointStore {
  checkpoints: GraphCheckpoint[] = [];
  private claims = new Map<string, { token: string; revision: number; leaseUntil: string }>();

  constructor(private readonly initial: GraphCheckpoint | null = null) {}

  async load(): Promise<GraphCheckpoint | null> {
    return structuredClone(this.checkpoints.at(-1) ?? this.initial);
  }

  async save(checkpoint: GraphCheckpoint): Promise<void> {
    this.checkpoints.push(structuredClone(checkpoint));
  }

  async claimNode(runId: string, nodeId: string, expectedRevision: number, ownerId: string, leaseUntil: string): Promise<string | null> {
    const latest = this.checkpoints.at(-1) ?? this.initial;
    if ((latest?.revision ?? 0) !== expectedRevision) return null;
    const key = `${runId}:${nodeId}`;
    const claim = this.claims.get(key);
    if (claim !== undefined && Date.parse(claim.leaseUntil) > Date.now()) return null;
    const token = `${key}:${ownerId}:${expectedRevision}`;
    this.claims.set(key, { token, revision: expectedRevision, leaseUntil });
    return token;
  }

  async renewClaim(claimToken: string, expectedRevision: number, leaseUntil: string): Promise<boolean> {
    for (const [key, claim] of this.claims) {
      if (claim.token === claimToken && claim.revision === expectedRevision) {
        this.claims.set(key, { ...claim, leaseUntil });
        return true;
      }
    }
    return false;
  }

  async saveAfterNode(checkpoint: GraphCheckpoint, expectedRevision: number, claimToken: string): Promise<GraphCheckpoint> {
    const key = `${checkpoint.runId}:${checkpoint.currentNodeId}`;
    const claim = this.claims.get(key);
    const latest = this.checkpoints.at(-1) ?? this.initial;
    if (claim?.token !== claimToken || claim.revision !== expectedRevision || (latest?.revision ?? 0) !== expectedRevision) {
      throw new Error("stale checkpoint or token mismatch");
    }
    const saved = { ...structuredClone(checkpoint), revision: expectedRevision + 1 };
    this.checkpoints.push(saved);
    this.claims.delete(key);
    return structuredClone(saved);
  }

  async releaseNode(runId: string, nodeId: string, claimToken: string): Promise<void> {
    const key = `${runId}:${nodeId}`;
    if (this.claims.get(key)?.token === claimToken) this.claims.delete(key);
  }

  claimCount(): number {
    return this.claims.size;
  }

  expireClaims(): void {
    this.claims.clear();
  }
}

type ScriptedGraphResult = Omit<GraphNodeExecutionResult, "requestId"> & { requestId?: string };

class ScriptedExecutor implements GraphNodeExecutor {
  requests: GraphNodeExecutionRequest[] = [];

  constructor(
    private readonly executeNode: (
      request: GraphNodeExecutionRequest,
    ) => ScriptedGraphResult | Promise<ScriptedGraphResult>,
  ) {}

  async execute(request: GraphNodeExecutionRequest): Promise<GraphNodeExecutionResult> {
    this.requests.push(request);
    return { requestId: request.requestId, ...await this.executeNode(request) };
  }
}

const budgets = {
  maxSteps: 20,
  maxCost: 10,
  maxDurationSeconds: 3600,
  maxConcurrency: 1,
  maxRetriesPerNode: 1,
};

function graph(overrides: Record<string, unknown> = {}) {
  const nodes = [
    {
      id: "start",
      kind: "tool",
      purpose: "Load one work item",
      toolRef: "queue.load",
      inputs: [],
      outputs: ["brief"],
    },
    {
      id: "work",
      kind: "agent",
      purpose: "Produce the work",
      agentId: "operator",
      role: "operator",
      promptRef: "prompts/work.md",
      session: "fresh",
      inputs: ["brief"],
      outputs: ["draft"],
    },
    {
      id: "improve",
      kind: "agent",
      purpose: "Propose governed improvements",
      agentId: "operator",
      role: "improver",
      promptRef: "prompts/improve.md",
      session: "fresh",
      inputs: ["draft"],
      outputs: ["learning-proposal"],
    },
  ];
  return compilePromptGraph({
    schemaVersion: 1,
    id: "runner-graph",
    loopId: "runner-loop",
    version: 1,
    executionMode: "single-agent-multi-session",
    entrypoint: "start",
    agents: [{
      id: "operator",
      runtime: "hermes",
      profile: "business-operator",
      sessionPolicy: "fresh",
      maxConcurrency: 1,
    }],
    budgets,
    nodes,
    edges: [
      { from: "start", to: "work", type: "data", artifact: "brief" },
      { from: "work", to: "improve", type: "data", artifact: "draft" },
    ],
    anchors: [{ id: "queue-evidence", nodeId: "start", evidence: "source records", immutable: true }],
    improvement: {
      enabled: true,
      nodeId: "improve",
      feedbackArtifacts: ["draft"],
      evaluationSuiteRef: "qa/runner.yaml",
      protectedNodeIds: ["start"],
      proposalPolicy: "human-approved",
      minFeedbackWindows: 3,
    },
    ...overrides,
  });
}

const input = {
  runId: "run-1",
  workItemId: "item-1",
  initialState: { tenant: "acme" },
  initialArtifacts: {},
  runContractHash: "b".repeat(64),
  inputSnapshotHash: "c".repeat(64),
};

describe("durable prompt graph runner", () => {
  it("runs a sequential graph and checkpoints before and after every node", async () => {
    const store = new MemoryCheckpointStore();
    const executor = new ScriptedExecutor((request) => ({
      status: "completed",
      cost: 0.1,
      artifacts: request.node.id === "start"
        ? { brief: "Write about durable loops" }
        : request.node.id === "work"
          ? { draft: "Draft" }
          : { "learning-proposal": "Keep prompts explicit" },
    }));

    const outcome = await runPromptGraph(graph(), input, { store, executor, runnerId: "runner-a" });

    expect(outcome.status).toBe("completed");
    expect(executor.requests.map(({ node }) => node.id)).toEqual(["start", "work", "improve"]);
    expect(store.checkpoints.map(({ phase }) => phase)).toEqual([
      "after-node", // durable revision-zero initialization before the first claim
      "after-node", "after-node", "after-node", "terminal",
    ]);
    expect(outcome.artifacts["learning-proposal"]).toBe("Keep prompts explicit");
  });

  it("routes on declarative conditions and never executes the rejected branch", async () => {
    const base = graph();
    const routed = graph({
      nodes: [
        ...base.definition.nodes,
        { id: "manual", kind: "human-gate", purpose: "Approve risky item", gateId: "risk-approval", inputs: ["draft"], outputs: [] },
      ],
      edges: [
        { from: "start", to: "work", type: "data", artifact: "brief" },
        { from: "work", to: "manual", type: "data", artifact: "draft", when: { path: "state.risk", operator: "eq", value: "high" } },
        { from: "work", to: "improve", type: "data", artifact: "draft", when: { path: "state.risk", operator: "neq", value: "high" } },
        { from: "manual", to: "improve", type: "control", dependencyReason: "approval obtained" },
      ],
    });
    const executor = new ScriptedExecutor((request) => ({
      status: "completed",
      cost: 0,
      artifacts: request.node.id === "start" ? { brief: "Brief" }
        : request.node.id === "work" ? { draft: "Draft" }
          : { "learning-proposal": "Proposal" },
    }));

    await runPromptGraph(routed, { ...input, initialState: { risk: "low" } }, {
      store: new MemoryCheckpointStore(), executor, runnerId: "runner-a",
    });

    expect(executor.requests.map(({ node }) => node.id)).toEqual(["start", "work", "improve"]);
  });

  it("bounds correction cycles by edge traversal count", async () => {
    const cyclic = graph({
      nodes: [
        { id: "start", kind: "tool", purpose: "Load", toolRef: "load", inputs: [], outputs: ["draft"] },
        { id: "review", kind: "evaluator", purpose: "Review", mode: "ai", agentId: "operator", promptRef: "review.md", criteria: ["quality"], inputs: ["draft"], outputs: ["verdict"] },
        { id: "improve", kind: "agent", purpose: "Improve", agentId: "operator", role: "improver", promptRef: "improve.md", inputs: ["verdict"], outputs: ["draft"] },
      ],
      edges: [
        { from: "start", to: "review", type: "data", artifact: "draft" },
        { from: "review", to: "improve", type: "data", artifact: "verdict" },
        { from: "improve", to: "review", type: "data", artifact: "draft", maxTraversals: 2 },
      ],
      improvement: {
        enabled: true,
        nodeId: "improve",
        feedbackArtifacts: ["verdict"],
        evaluationSuiteRef: "qa/cycle.yaml",
        protectedNodeIds: ["start"],
        proposalPolicy: "human-approved",
        minFeedbackWindows: 2,
      },
    });
    const executor = new ScriptedExecutor((request) => ({
      status: "completed",
      cost: 0,
      artifacts: request.node.id === "review" ? { verdict: "retry" } : { draft: "revision" },
    }));

    const outcome = await runPromptGraph(cyclic, input, { store: new MemoryCheckpointStore(), executor, runnerId: "runner-a" });

    expect(outcome).toMatchObject({ status: "escalated", reasonCode: "MAX_TRAVERSALS" });
    expect(executor.requests.map(({ node }) => node.id)).toEqual([
      "start", "review", "improve", "review", "improve", "review", "improve",
    ]);
    expect(outcome.edgeTraversals["improve->review#2"]).toBe(2);
  });

  it("supports all/any joins and reports incomplete required fan-in", async () => {
    const joined = (activation: "all" | "any", secondCondition?: unknown) => graph({
      nodes: [
        { id: "start", kind: "tool", purpose: "Start", toolRef: "start", inputs: [], outputs: [] },
        { id: "left", kind: "tool", purpose: "Left", toolRef: "left", inputs: [], outputs: ["left-result"] },
        { id: "right", kind: "tool", purpose: "Right", toolRef: "right", inputs: [], outputs: ["right-result"] },
        { id: "merge", kind: "join", purpose: "Merge", activation, inputs: ["left-result", "right-result"], outputs: ["merged"] },
        { id: "improve", kind: "agent", purpose: "Improve", agentId: "operator", role: "improver", promptRef: "improve.md", inputs: ["merged"], outputs: ["learning-proposal"] },
      ],
      edges: [
        { from: "start", to: "left", type: "control", dependencyReason: "fan out" },
        { from: "start", to: "right", type: "control", dependencyReason: "fan out", ...(secondCondition === undefined ? {} : { when: secondCondition }) },
        { from: "left", to: "merge", type: "data", artifact: "left-result" },
        { from: "right", to: "merge", type: "data", artifact: "right-result" },
        { from: "merge", to: "improve", type: "data", artifact: "merged" },
      ],
    });
    const execute = (request: GraphNodeExecutionRequest): ScriptedGraphResult => ({
      status: "completed",
      cost: 0,
      artifacts: request.node.id === "left" ? { "left-result": "L" }
        : request.node.id === "right" ? { "right-result": "R" }
          : request.node.id === "merge" ? { merged: "LR" }
            : request.node.id === "improve" ? { "learning-proposal": "P" } : {},
    });

    const allExecutor = new ScriptedExecutor(execute);
    const allOutcome = await runPromptGraph(joined("all"), input, {
      store: new MemoryCheckpointStore(), executor: allExecutor, runnerId: "runner-a",
    });
    expect(allOutcome.status).toBe("completed");
    expect(allExecutor.requests.map(({ node }) => node.id)).toEqual(["start", "left", "right", "merge", "improve"]);

    const anyExecutor = new ScriptedExecutor(execute);
    const anyOutcome = await runPromptGraph(joined("any", { path: "state.useRight", operator: "eq", value: true }), input, {
      store: new MemoryCheckpointStore(), executor: anyExecutor, runnerId: "runner-a",
    });
    expect(anyOutcome.status).toBe("completed");
    expect(anyExecutor.requests.map(({ node }) => node.id)).toEqual(["start", "left", "merge", "improve"]);

    const incomplete = await runPromptGraph(joined("all", { path: "state.useRight", operator: "eq", value: true }), input, {
      store: new MemoryCheckpointStore(), executor: new ScriptedExecutor(execute), runnerId: "runner-a",
    });
    expect(incomplete).toMatchObject({ status: "failed", reasonCode: "FAN_IN_INCOMPLETE" });
  });

  it("checkpoints a human wait and resumes it without re-running completed nodes", async () => {
    const gated = graph({
      nodes: [
        { id: "start", kind: "tool", purpose: "Load", toolRef: "load", inputs: [], outputs: ["brief"] },
        { id: "approve", kind: "human-gate", purpose: "Approve", gateId: "publish", inputs: ["brief"], outputs: ["approval"] },
        { id: "improve", kind: "agent", purpose: "Improve", agentId: "operator", role: "improver", promptRef: "improve.md", inputs: ["approval"], outputs: ["learning-proposal"] },
      ],
      edges: [
        { from: "start", to: "approve", type: "data", artifact: "brief" },
        { from: "approve", to: "improve", type: "data", artifact: "approval" },
      ],
    });
    const store = new MemoryCheckpointStore();
    let gateCalls = 0;
    const executor = new ScriptedExecutor((request) => {
      if (request.node.id === "approve" && gateCalls++ === 0) return { status: "wait-human", cost: 0 };
      return {
        status: "completed",
        cost: 0,
        artifacts: request.node.id === "start" ? { brief: "B" }
          : request.node.id === "approve" ? { approval: true }
            : { "learning-proposal": "P" },
      };
    });

    const waiting = await runPromptGraph(gated, input, { store, executor, runnerId: "runner-a" });
    const stillWaiting = await runPromptGraph(gated, input, { store, executor, runnerId: "runner-a" });
    const completed = await runPromptGraph(gated, {
      ...input,
      inputSnapshotHash: "d".repeat(64), resumeCapabilityId: "graph-resume-1",
    }, { store, executor, runnerId: "runner-a", resumeCapabilities: { async consume(id) { return {
      id, graphId: gated.definition.id, graphVersion: gated.definition.version, topologyHash: gated.topologyHash,
      loopId: gated.definition.loopId, runId: input.runId, workItemId: input.workItemId,
      nodeId: "approve", waitStatus: "waiting-human", checkpointRevision: 2,
      oldSnapshotHash: input.inputSnapshotHash, newSnapshotHash: "d".repeat(64), runContractHash: input.runContractHash,
      issuedAt: "2026-08-04T09:00:00.000Z", expiresAt: "2099-08-04T11:00:00.000Z",
    }; } } });

    expect(waiting.status).toBe("waiting-human");
    expect(stillWaiting.status).toBe("waiting-human");
    expect(completed.status).toBe("completed");
    expect(executor.requests.map(({ node }) => node.id)).toEqual(["start", "approve", "approve", "improve"]);
  });

  it("enforces step, cost and deadline budgets", async () => {
    const executor = new ScriptedExecutor(() => ({ status: "completed", cost: 5, artifacts: { brief: "B" } }));
    const costGraph = graph({ budgets: { ...budgets, maxCost: 1 } });
    expect(await runPromptGraph(costGraph, input, { store: new MemoryCheckpointStore(), executor, runnerId: "runner-a" }))
      .toMatchObject({ status: "escalated", reasonCode: "MAX_COST" });

    const stepGraph = graph({ budgets: { ...budgets, maxSteps: 1 } });
    expect(await runPromptGraph(stepGraph, input, {
      store: new MemoryCheckpointStore(),
      executor: new ScriptedExecutor(() => ({ status: "completed", cost: 0, artifacts: { brief: "B" } })),
      runnerId: "runner-a",
    })).toMatchObject({ status: "escalated", reasonCode: "MAX_STEPS" });

    expect(await runPromptGraph(graph(), input, {
      store: new MemoryCheckpointStore(),
      executor: new ScriptedExecutor(() => ({ status: "completed", cost: 0 })),
      now: () => new Date("2026-08-04T12:00:01.000Z"),
      deadline: "2026-08-04T12:00:00.000Z",
      runnerId: "runner-a",
    })).toMatchObject({ status: "escalated", reasonCode: "DEADLINE" });
  });

  it("executes sequentially with maxConcurrency fixed to one", async () => {
    const base = graph();
    const resources = graph({
      nodes: base.definition.nodes.map((node) => node.id === "work" || node.id === "improve"
        ? { ...node, resourceLocks: ["cms:site"] }
        : node),
      edges: [
        { from: "start", to: "work", type: "data", artifact: "brief" },
        { from: "work", to: "improve", type: "data", artifact: "draft" },
      ],
    });
    let active = 0;
    let peak = 0;
    const executor = new ScriptedExecutor(async (request) => {
      active += 1;
      peak = Math.max(peak, active);
      await Promise.resolve();
      active -= 1;
      return { status: "completed", cost: 0, artifacts: request.node.id === "start" ? { brief: "B" } : request.node.id === "work" ? { draft: "D" } : { "learning-proposal": "P" } };
    });

    await runPromptGraph(resources, input, { store: new MemoryCheckpointStore(), executor, runnerId: "runner-a" });
    expect(peak).toBe(1);
  });

  it("fails closed when a selected data edge has no declared output artifact", async () => {
    const executor = new ScriptedExecutor(() => ({ status: "completed", cost: 0, artifacts: {} }));

    const outcome = await runPromptGraph(graph(), input, {
      store: new MemoryCheckpointStore(),
      executor,
      runnerId: "runner-a",
    });

    expect(outcome).toMatchObject({ status: "failed", reasonCode: "ARTIFACT_CONTRACT_VIOLATION" });
    expect(executor.requests.map(({ node }) => node.id)).toEqual(["start"]);
  });

  it("persists output propagation and ready nodes in the same after-node checkpoint", async () => {
    class InspectingStore extends MemoryCheckpointStore {
      private crashOnce = true;

      async saveAfterNode(checkpoint: GraphCheckpoint, expectedRevision: number, claimToken: string): Promise<GraphCheckpoint> {
        if (this.crashOnce && checkpoint.phase === "after-node" && checkpoint.currentNodeId === "start") {
          expect(checkpoint.artifacts.brief).toBe("B");
          expect(checkpoint.edgeTraversals["start->work#0"]).toBe(1);
          expect(checkpoint.readyNodeIds).toContain("work");
          this.crashOnce = false;
          throw new Error("simulated durable-store crash");
        }
        return super.saveAfterNode(checkpoint, expectedRevision, claimToken);
      }
    }
    const store = new InspectingStore();
    const executor = new ScriptedExecutor((request) => ({
      status: "completed",
      cost: 0,
      artifacts: request.node.id === "start" ? { brief: "B" }
        : request.node.id === "work" ? { draft: "D" }
          : { "learning-proposal": "P" },
    }));

    await expect(runPromptGraph(graph(), input, { store, executor, runnerId: "runner-a" }))
      .rejects.toThrow("simulated durable-store crash");
    expect(store.claimCount()).toBe(1);
    store.expireClaims();
    const recovered = await runPromptGraph(graph(), input, { store, executor, runnerId: "runner-b" });
    expect(recovered.status).toBe("completed");
    expect(store.claimCount()).toBe(0);
  });

  it("claims a node durably so concurrent runners cannot execute it twice", async () => {
    const store = new MemoryCheckpointStore();
    let executions = 0;
    let releaseExecution!: () => void;
    const blocked = new Promise<void>((resolve) => { releaseExecution = resolve; });
    const executor = new ScriptedExecutor(async (request) => {
      executions += 1;
      if (request.node.id === "start") await blocked;
      return { status: "completed", cost: 0, artifacts: request.node.id === "start" ? { brief: "B" } : request.node.id === "work" ? { draft: "D" } : { "learning-proposal": "P" } };
    });

    const first = runPromptGraph(graph(), input, { store, executor, runnerId: "runner-a" });
    await new Promise((resolve) => setTimeout(resolve, 0));
    const second = runPromptGraph(graph(), input, { store, executor, runnerId: "runner-b" });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(executions).toBe(1);
    releaseExecution();
    const outcomes = await Promise.all([first, second]);
    expect(outcomes.filter(({ status }) => status === "completed")).toHaveLength(1);
    expect(outcomes.some(({ reasonCode }) => reasonCode === "RUN_CLAIMED")).toBe(true);
  });

  it("renews the node lease by heartbeat while execution is in flight", async () => {
    class HeartbeatStore extends MemoryCheckpointStore {
      renewals = 0;
      async renewClaim(token: string, revision: number, leaseUntil: string): Promise<boolean> {
        this.renewals += 1;
        return super.renewClaim(token, revision, leaseUntil);
      }
    }
    const store = new HeartbeatStore();
    const outcome = await runPromptGraph(graph(), input, {
      store, runnerId: "runner-a",
      executor: new ScriptedExecutor((request) => ({ status: "completed", cost: 0,
        artifacts: request.node.id === "start" ? { brief: "B" } : request.node.id === "work" ? { draft: "D" } : { "learning-proposal": "P" } })),
      setInterval: (callback) => { callback(); return 1; }, clearInterval: () => undefined,
    });
    expect(outcome.status).toBe("completed");
    expect(store.renewals).toBe(3);
  });

  it("requires confirmed side-effect state from every consequential node", async () => {
    const consequential = graph({
      nodes: graph().definition.nodes.map((node) => node.id === "start" ? {
        ...node,
        sideEffect: "consequential",
        idempotencyKeyRef: "state.idempotencyKey",
        resourceLocks: ["queue:item"],
      } : node),
    });
    const outcome = await runPromptGraph(consequential, {
      ...input,
      initialState: { idempotencyKey: "item-1:start" },
    }, {
      store: new MemoryCheckpointStore(),
      executor: new ScriptedExecutor(() => ({ status: "completed", cost: 0, artifacts: { brief: "B" }, sideEffectState: "none" })),
      runnerId: "runner-a",
    });
    expect(outcome).toMatchObject({ status: "escalated", reasonCode: "SIDE_EFFECT_UNKNOWN" });
  });

  it("accepts exact maximum cost and escalates only on an overrun", async () => {
    const executor = new ScriptedExecutor((request) => ({
      status: "completed",
      cost: request.node.id === "start" ? 10 : 0,
      artifacts: request.node.id === "start" ? { brief: "B" } : request.node.id === "work" ? { draft: "D" } : { "learning-proposal": "P" },
    }));
    const outcome = await runPromptGraph(graph(), input, { store: new MemoryCheckpointStore(), executor, runnerId: "runner-a" });
    expect(outcome.status).toBe("completed");
    expect(outcome.accumulatedCost).toBe(10);
  });

  it("applies node timeoutSeconds", async () => {
    const timed = graph({
      nodes: graph().definition.nodes.map((node) => node.id === "start" ? { ...node, timeoutSeconds: 1 } : node),
    });
    const outcome = await runPromptGraph(timed, input, {
      store: new MemoryCheckpointStore(),
      executor: new ScriptedExecutor(() => new Promise(() => undefined)),
      runnerId: "runner-a",
      setTimeout: (callback: () => void) => { callback(); return 0; },
      clearTimeout: () => undefined,
    });
    expect(outcome).toMatchObject({ status: "failed", reasonCode: "NODE_TIMEOUT" });
  });

  it("releases a node claim after an ordinary terminal failure", async () => {
    const store = new MemoryCheckpointStore();
    const outcome = await runPromptGraph(graph(), input, {
      store,
      executor: new ScriptedExecutor(() => ({ status: "failed", cost: 0, error: "expected failure" })),
      runnerId: "runner-a",
    });
    expect(outcome).toMatchObject({ status: "failed", reasonCode: "NODE_FAILED" });
    expect(store.claimCount()).toBe(0);
  });

  it("rejects malformed executor result status and side-effect state", async () => {
    for (const malformed of [
      { status: "forged", cost: 0 },
      { status: "completed", cost: 0, sideEffectState: "forged" },
    ]) {
      const outcome = await runPromptGraph(graph(), input, {
        store: new MemoryCheckpointStore(),
        executor: new ScriptedExecutor(() => malformed as never),
        runnerId: "runner-a",
      });
      expect(outcome).toMatchObject({ status: "failed", reasonCode: "NODE_FAILED" });
    }
  });

  it("rejects a resume capability that is not bound to the exact waiting checkpoint", async () => {
    const gated = graph({
      nodes: graph().definition.nodes.map((node) => node.id === "start"
        ? { ...node, kind: "human-gate", gateId: "start-approval" }
        : node),
    });
    const store = new MemoryCheckpointStore();
    const executor = new ScriptedExecutor(() => ({ status: "wait-human", cost: 0 }));
    await runPromptGraph(gated, input, { store, executor, runnerId: "runner-a" });
    const outcome = await runPromptGraph(gated, {
      ...input,
      inputSnapshotHash: "d".repeat(64), resumeCapabilityId: "bad-resume",
    }, { store, executor, runnerId: "runner-a", resumeCapabilities: { async consume(id) { return {
      id, graphId: gated.definition.id, graphVersion: gated.definition.version, topologyHash: gated.topologyHash,
      loopId: gated.definition.loopId, runId: input.runId, workItemId: "other-item",
      nodeId: "start", waitStatus: "waiting-human", checkpointRevision: 1,
      oldSnapshotHash: input.inputSnapshotHash, newSnapshotHash: "d".repeat(64), runContractHash: input.runContractHash,
      issuedAt: "2026-08-04T09:00:00.000Z", expiresAt: "2099-08-04T11:00:00.000Z",
    }; } } });
    expect(outcome).toMatchObject({ status: "escalated", reasonCode: "CHECKPOINT_MISMATCH" });
  });

  it("accepts a consequential result only through exact external effect evidence", async () => {
    const consequential = graph({
      nodes: graph().definition.nodes.map((node) => node.id === "start" ? {
        ...node, sideEffect: "consequential", idempotencyKeyRef: "state.key", resourceLocks: ["queue:item"],
      } : node),
    });
    const verified: string[] = [];
    const outcome = await runPromptGraph(consequential, { ...input, initialState: { key: "effect-key" } }, {
      store: new MemoryCheckpointStore(), runnerId: "runner-a",
      executor: new ScriptedExecutor((request) => ({
        status: "completed", cost: 0,
        artifacts: request.node.id === "start" ? { brief: "B" } : request.node.id === "work" ? { draft: "D" } : { "learning-proposal": "P" },
        ...(request.node.id === "start" ? { sideEffectState: "confirmed" as const, effectEvidenceId: "effect-evidence-1" } : {}),
      })),
      effectTrustResolver: { async consume(id, evidence) {
        verified.push(JSON.stringify({ id, ...evidence }));
        return id === "effect-evidence-1"
          && evidence.requestId === "run-1:1:start:1" && evidence.loopId === "runner-loop"
          && evidence.runId === "run-1" && evidence.workItemId === "item-1" && evidence.nodeId === "start"
          && evidence.idempotencyKey === "effect-key";
      } },
    });
    expect(outcome.status).toBe("completed");
    expect(verified).toHaveLength(1);
  });

  it("filesystem store rejects a late stale claim and enforces lease/token CAS", async () => {
    const root = await mkdtemp(join(tmpdir(), "loopstack-graph-store-"));
    let hostNow = new Date("2026-08-04T10:00:00.000Z");
    const store = new FilesystemGraphCheckpointStore(root, () => hostNow);
    const checkpoint: GraphCheckpoint = {
      revision: 0, graphId: "runner-graph", graphVersion: 1, topologyHash: "a".repeat(64),
      loopId: "runner-loop", runId: "durable-run", workItemId: "item-1",
      runContractHash: "b".repeat(64), inputSnapshotHash: "c".repeat(64), phase: "before-node",
      status: "running", currentNodeId: "start", readyNodeIds: [], step: 0, accumulatedCost: 0,
      artifacts: {}, state: {}, nodeAttempts: { start: 1 }, edgeTraversals: {}, triggeredIncomingEdges: {},
      startedAt: hostNow.toISOString(), updatedAt: hostNow.toISOString(),
    };
    await store.save(checkpoint);
    await expect(store.save({
      ...checkpoint,
      phase: "terminal",
      status: "completed",
      currentNodeId: undefined,
    })).rejects.toThrow(/initial|already|revision|claim/i);
    const tokenA = await store.claimNode("durable-run", "start", 0, "runner-a", "2026-08-04T10:01:00.000Z");
    expect(tokenA).toBeTruthy();
    const committed = await store.saveAfterNode({ ...checkpoint, phase: "after-node" }, 0, tokenA!);
    expect(committed.revision).toBe(1);
    expect(await store.claimNode("durable-run", "start", 0, "stale-runner", "2026-08-04T10:01:00.000Z")).toBeNull();

    const tokenB = await store.claimNode("durable-run", "work", 1, "runner-b", "2026-08-04T10:01:00.000Z");
    expect(tokenB).toBeTruthy();
    await expect(store.saveAfterNode({ ...committed, currentNodeId: "work" }, 1, "wrong-token")).rejects.toThrow(/claim|stale/i);
    hostNow = new Date("2026-08-04T10:02:00.000Z");
    const tokenC = await store.claimNode("durable-run", "work", 1, "runner-c", "2026-08-04T10:03:00.000Z");
    expect(tokenC).toBeTruthy();
  });

  it("does not reclaim an expired filesystem graph lock while its owner process is alive", async () => {
    const root = await mkdtemp(join(tmpdir(), "loopstack-graph-fence-"));
    let hostNow = new Date("2026-08-04T10:00:00.000Z");
    let releaseA!: () => void;
    const pausedA = new Promise<void>((resolve) => { releaseA = resolve; });
    let reachedBarrier!: () => void;
    const barrierReached = new Promise<void>((resolve) => { reachedBarrier = resolve; });
    class PausedStore extends FilesystemGraphCheckpointStore {
      protected async beforeCommit(): Promise<void> { reachedBarrier(); await pausedA; }
    }
    const checkpoint: GraphCheckpoint = {
      revision: 0, graphId: "runner-graph", graphVersion: 1, topologyHash: "a".repeat(64),
      loopId: "runner-loop", runId: "fenced-run", workItemId: "item-1",
      runContractHash: "b".repeat(64), inputSnapshotHash: "c".repeat(64), phase: "after-node",
      status: "running", readyNodeIds: ["start"], step: 0, accumulatedCost: 0,
      artifacts: {}, state: {}, nodeAttempts: {}, edgeTraversals: {}, triggeredIncomingEdges: {},
      startedAt: hostNow.toISOString(), updatedAt: hostNow.toISOString(),
    };
    const liveWrite = new PausedStore(root, () => hostNow, 10).save(checkpoint);
    await barrierReached;
    hostNow = new Date("2026-08-04T10:00:01.000Z");
    let contenderSettled = false;
    const contender = new FilesystemGraphCheckpointStore(root, () => hostNow, 10).save({
      ...checkpoint, status: "failed", phase: "terminal", reason: "contender",
    }).finally(() => { contenderSettled = true; });
    await new Promise((resolve) => setTimeout(resolve, 25));
    expect(contenderSettled).toBe(false);
    releaseA();
    await liveWrite;
    await expect(contender).rejects.toThrow(/initial|already/i);
    expect(await new FilesystemGraphCheckpointStore(root).load("fenced-run")).toMatchObject({ status: "running" });
  });

  it("reclaims a filesystem graph lock whose owner process is definitively dead", async () => {
    const root = await mkdtemp(join(tmpdir(), "loopstack-graph-dead-lock-"));
    const bootId = (await readFile("/proc/sys/kernel/random/boot_id", "utf8")).trim();
    const checkpoint: GraphCheckpoint = {
      revision: 0, graphId: "runner-graph", graphVersion: 1, topologyHash: "a".repeat(64),
      loopId: "runner-loop", runId: "dead-owner-run", workItemId: "item-1",
      runContractHash: "b".repeat(64), inputSnapshotHash: "c".repeat(64), phase: "after-node",
      status: "running", readyNodeIds: ["start"], step: 0, accumulatedCost: 0,
      artifacts: {}, state: {}, nodeAttempts: {}, edgeTraversals: {}, triggeredIncomingEdges: {},
      startedAt: "2026-08-04T10:00:00.000Z", updatedAt: "2026-08-04T10:00:00.000Z",
    };
    await writeFile(join(root, "dead-owner-run.json.lock"), JSON.stringify({
      token: "00000000-0000-4000-8000-000000000001", ownerId: "crashed-runner",
      pid: 2_147_483_647, bootId, generation: 1,
      createdAt: "2026-08-04T10:00:00.000Z", leaseUntil: "2026-08-04T10:00:00.010Z",
    }));
    const store = new FilesystemGraphCheckpointStore(root, () => new Date("2026-08-04T10:00:01.000Z"), 10);
    await store.save(checkpoint);
    expect(await store.load("dead-owner-run")).toMatchObject({ runId: "dead-owner-run", status: "running" });
  });

  it.each([
    ["pid", (lock: Record<string, unknown>) => ({ ...lock, pid: Number(lock.pid) + 1 })],
    ["bootId", (lock: Record<string, unknown>) => ({ ...lock, bootId: "00000000-0000-4000-8000-000000000099" })],
    ["generation", (lock: Record<string, unknown>) => ({ ...lock, generation: Number(lock.generation) + 1 })],
  ])("does not remove a graph lock replaced with the same token but different %s", async (_field, replaceOwner) => {
    const root = await mkdtemp(join(tmpdir(), "loopstack-graph-release-fence-"));
    const lockPath = join(root, "release-fence-run.json.lock");
    let replacement: Record<string, unknown> | undefined;
    const store = new FilesystemGraphCheckpointStore(root, () => new Date("2026-08-04T10:00:00.000Z"), 5_000, (event) => {
      if (event !== "state-rename-dir") return;
      const acquired = JSON.parse(readFileSync(lockPath, "utf8")) as Record<string, unknown>;
      replacement = replaceOwner(acquired);
      writeFileSync(lockPath, JSON.stringify(replacement));
    });
    await store.save({
      revision: 0, graphId: "runner-graph", graphVersion: 1, topologyHash: "a".repeat(64),
      loopId: "runner-loop", runId: "release-fence-run", workItemId: "item-1",
      runContractHash: "b".repeat(64), inputSnapshotHash: "c".repeat(64), phase: "after-node",
      status: "running", readyNodeIds: ["start"], step: 0, accumulatedCost: 0,
      artifacts: {}, state: {}, nodeAttempts: {}, edgeTraversals: {}, triggeredIncomingEdges: {},
      startedAt: "2026-08-04T10:00:00.000Z", updatedAt: "2026-08-04T10:00:00.000Z",
    });
    expect(JSON.parse(await readFile(lockPath, "utf8"))).toEqual(replacement);
  });

  it("fsyncs graph state and every lock directory transition in durability order", async () => {
    const root = await mkdtemp(join(tmpdir(), "loopstack-graph-fsync-"));
    const events: string[] = [];
    const durableNow = () => new Date("2026-08-04T10:00:00.000Z");
    const store = new FilesystemGraphCheckpointStore(root, durableNow, 5_000, (event) => events.push(event));
    await store.save({
      revision: 0, graphId: "runner-graph", graphVersion: 1, topologyHash: "a".repeat(64),
      loopId: "runner-loop", runId: "fsync-run", workItemId: "item-1",
      runContractHash: "b".repeat(64), inputSnapshotHash: "c".repeat(64), phase: "after-node",
      status: "running", readyNodeIds: ["start"], step: 0, accumulatedCost: 0,
      artifacts: {}, state: {}, nodeAttempts: {}, edgeTraversals: {}, triggeredIncomingEdges: {},
      startedAt: durableNow().toISOString(), updatedAt: durableNow().toISOString(),
    });
    expect(events).toEqual(["lock-create-dir", "state-temp-file", "state-rename-dir", "lock-remove-dir"]);
  });

  it("filesystem store rejects a malformed durable checkpoint", async () => {
    const root = await mkdtemp(join(tmpdir(), "loopstack-graph-malformed-"));
    await writeFile(join(root, "malformed-run.json"), JSON.stringify({ checkpoint: { revision: 0 }, claim: null }));
    await expect(new FilesystemGraphCheckpointStore(root).load("malformed-run")).rejects.toThrow();
  });

  it("recovers from a commit-then-error without executing the committed node twice", async () => {
    const root = await mkdtemp(join(tmpdir(), "loopstack-graph-recovery-"));
    class CommitThenErrorStore extends FilesystemGraphCheckpointStore {
      private fail = true;
      async saveAfterNode(checkpoint: GraphCheckpoint, revision: number, token: string): Promise<GraphCheckpoint> {
        const saved = await super.saveAfterNode(checkpoint, revision, token);
        if (this.fail) { this.fail = false; throw new Error("commit-then-error"); }
        return saved;
      }
    }
    const store = new CommitThenErrorStore(root);
    const calls: string[] = [];
    const executor = new ScriptedExecutor((request) => {
      calls.push(request.node.id);
      return { status: "completed", cost: 0, artifacts: request.node.id === "start" ? { brief: "B" }
        : request.node.id === "work" ? { draft: "D" } : { "learning-proposal": "P" } };
    });
    await expect(runPromptGraph(graph(), input, { store, executor, runnerId: "runner-a" })).rejects.toThrow("commit-then-error");
    const recovered = await runPromptGraph(graph(), input, { store, executor, runnerId: "runner-b" });
    expect(recovered.status).toBe("completed");
    expect(calls.filter((id) => id === "start")).toHaveLength(1);
  });
});
