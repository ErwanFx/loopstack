import { describe, expect, it } from "vitest";
import { compilePromptGraph } from "../../src/graph/compiler.js";
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

  constructor(private readonly initial: GraphCheckpoint | null = null) {}

  async load(): Promise<GraphCheckpoint | null> {
    return this.checkpoints.at(-1) ?? this.initial;
  }

  async save(checkpoint: GraphCheckpoint): Promise<void> {
    this.checkpoints.push(structuredClone(checkpoint));
  }
}

class ScriptedExecutor implements GraphNodeExecutor {
  requests: GraphNodeExecutionRequest[] = [];

  constructor(
    private readonly executeNode: (
      request: GraphNodeExecutionRequest,
    ) => GraphNodeExecutionResult | Promise<GraphNodeExecutionResult>,
  ) {}

  async execute(request: GraphNodeExecutionRequest): Promise<GraphNodeExecutionResult> {
    this.requests.push(request);
    return this.executeNode(request);
  }
}

const budgets = {
  maxSteps: 20,
  maxCost: 10,
  maxDurationSeconds: 3600,
  maxConcurrency: 4,
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

    const outcome = await runPromptGraph(graph(), input, { store, executor });

    expect(outcome.status).toBe("completed");
    expect(executor.requests.map(({ node }) => node.id)).toEqual(["start", "work", "improve"]);
    expect(store.checkpoints.map(({ phase }) => phase)).toEqual([
      "before-node", "after-node", "before-node", "after-node", "before-node", "after-node", "terminal",
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
      store: new MemoryCheckpointStore(), executor,
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

    const outcome = await runPromptGraph(cyclic, input, { store: new MemoryCheckpointStore(), executor });

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
    const execute = (request: GraphNodeExecutionRequest): GraphNodeExecutionResult => ({
      status: "completed",
      cost: 0,
      artifacts: request.node.id === "left" ? { "left-result": "L" }
        : request.node.id === "right" ? { "right-result": "R" }
          : request.node.id === "merge" ? { merged: "LR" }
            : request.node.id === "improve" ? { "learning-proposal": "P" } : {},
    });

    const allExecutor = new ScriptedExecutor(execute);
    const allOutcome = await runPromptGraph(joined("all"), input, {
      store: new MemoryCheckpointStore(), executor: allExecutor,
    });
    expect(allOutcome.status).toBe("completed");
    expect(allExecutor.requests.map(({ node }) => node.id)).toEqual(["start", "left", "right", "merge", "improve"]);

    const anyExecutor = new ScriptedExecutor(execute);
    const anyOutcome = await runPromptGraph(joined("any", { path: "state.useRight", operator: "eq", value: true }), input, {
      store: new MemoryCheckpointStore(), executor: anyExecutor,
    });
    expect(anyOutcome.status).toBe("completed");
    expect(anyExecutor.requests.map(({ node }) => node.id)).toEqual(["start", "left", "merge", "improve"]);

    const incomplete = await runPromptGraph(joined("all", { path: "state.useRight", operator: "eq", value: true }), input, {
      store: new MemoryCheckpointStore(), executor: new ScriptedExecutor(execute),
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

    const waiting = await runPromptGraph(gated, input, { store, executor });
    const completed = await runPromptGraph(gated, input, { store, executor });

    expect(waiting.status).toBe("waiting-human");
    expect(completed.status).toBe("completed");
    expect(executor.requests.map(({ node }) => node.id)).toEqual(["start", "approve", "approve", "improve"]);
  });

  it("enforces step, cost and deadline budgets", async () => {
    const executor = new ScriptedExecutor(() => ({ status: "completed", cost: 5, artifacts: { brief: "B" } }));
    const costGraph = graph({ budgets: { ...budgets, maxCost: 1 } });
    expect(await runPromptGraph(costGraph, input, { store: new MemoryCheckpointStore(), executor }))
      .toMatchObject({ status: "escalated", reasonCode: "MAX_COST" });

    const stepGraph = graph({ budgets: { ...budgets, maxSteps: 1 } });
    expect(await runPromptGraph(stepGraph, input, {
      store: new MemoryCheckpointStore(),
      executor: new ScriptedExecutor(() => ({ status: "completed", cost: 0, artifacts: { brief: "B" } })),
    })).toMatchObject({ status: "escalated", reasonCode: "MAX_STEPS" });

    expect(await runPromptGraph(graph(), input, {
      store: new MemoryCheckpointStore(),
      executor: new ScriptedExecutor(() => ({ status: "completed", cost: 0 })),
      now: () => new Date("2026-08-04T12:00:01.000Z"),
      deadline: "2026-08-04T12:00:00.000Z",
    })).toMatchObject({ status: "escalated", reasonCode: "DEADLINE" });
  });

  it("serializes execution so shared resources cannot overlap", async () => {
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

    await runPromptGraph(resources, input, { store: new MemoryCheckpointStore(), executor });
    expect(peak).toBe(1);
  });

  it("fails closed when a selected data edge has no declared output artifact", async () => {
    const executor = new ScriptedExecutor(() => ({ status: "completed", cost: 0, artifacts: {} }));

    const outcome = await runPromptGraph(graph(), input, {
      store: new MemoryCheckpointStore(),
      executor,
    });

    expect(outcome).toMatchObject({ status: "failed", reasonCode: "ARTIFACT_CONTRACT_VIOLATION" });
    expect(executor.requests.map(({ node }) => node.id)).toEqual(["start"]);
  });
});
