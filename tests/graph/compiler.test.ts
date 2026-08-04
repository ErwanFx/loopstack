import { describe, expect, it } from "vitest";
import { GraphCompileError, compilePromptGraph } from "../../src/graph/compiler.js";

const baseGraph = {
  schemaVersion: 1,
  id: "seo-content",
  loopId: "seo-growth",
  version: 1,
  executionMode: "single-agent-multi-session",
  entrypoint: "research",
  agents: [{
    id: "seo-operator",
    runtime: "hermes",
    profile: "ecoi-seo",
    sessionPolicy: "fresh",
    maxConcurrency: 1,
  }],
  budgets: {
    maxSteps: 20,
    maxCost: 10,
    maxDurationSeconds: 1800,
    maxConcurrency: 1,
    maxRetriesPerNode: 2,
  },
  nodes: [
    {
      id: "research",
      kind: "agent",
      purpose: "Research keywords",
      agentId: "seo-operator",
      role: "operator",
      promptRef: "prompts/keyword-research.md",
      session: "fresh",
      skills: ["openseo"],
      tools: ["openseo.keyword-research"],
      inputs: [],
      outputs: ["keyword-report"],
    },
    {
      id: "write",
      kind: "agent",
      purpose: "Write the article",
      agentId: "seo-operator",
      role: "operator",
      promptRef: "prompts/article-writing.md",
      session: "fresh",
      skills: ["seo-writing"],
      tools: [],
      inputs: ["keyword-report"],
      outputs: ["article-draft"],
    },
    {
      id: "review",
      kind: "evaluator",
      purpose: "Review against the SEO rubric",
      mode: "ai",
      agentId: "seo-operator",
      promptRef: "prompts/seo-review.md",
      session: "fresh",
      criteria: ["sources-resolve", "search-intent-covered"],
      inputs: ["article-draft"],
      outputs: ["review-decision"],
    },
    {
      id: "improve",
      kind: "agent",
      purpose: "Propose versioned improvements",
      agentId: "seo-operator",
      role: "improver",
      promptRef: "prompts/improve-loop.md",
      session: "fresh",
      skills: [],
      tools: [],
      inputs: ["ranking-feedback"],
      outputs: ["learning-proposal"],
    },
  ],
  edges: [
    { from: "research", to: "write", type: "data", artifact: "keyword-report" },
    { from: "write", to: "review", type: "data", artifact: "article-draft" },
    {
      from: "review",
      to: "write",
      type: "control",
      when: { path: "review-decision.status", operator: "eq", value: "revise" },
      maxTraversals: 2,
      dependencyReason: "Revise only when the independent evaluation fails",
    },
    {
      from: "review",
      to: "improve",
      type: "control",
      when: { path: "review-decision.status", operator: "eq", value: "approved" },
      dependencyReason: "Open the delayed feedback phase after approval",
    },
  ],
  anchors: [{
    id: "review-anchor",
    nodeId: "review",
    evidence: "The evaluation rubric and resolved sources",
    immutable: true,
  }],
  improvement: {
    enabled: true,
    nodeId: "improve",
    feedbackArtifacts: ["ranking-feedback"],
    evaluationSuiteRef: "evaluations/seo.yaml",
    protectedNodeIds: ["review"],
    proposalPolicy: "risk-gated",
    minFeedbackWindows: 1,
  },
} as const;

function issueCodes(fn: () => unknown): string[] {
  try {
    fn();
    return [];
  } catch (error) {
    if (!(error instanceof GraphCompileError)) throw error;
    return error.issues.map((issue) => issue.code);
  }
}

describe("prompt graph compiler", () => {
  it("compiles one Hermes profile reused by fresh bounded sessions", () => {
    const compiled = compilePromptGraph(baseGraph);
    expect(compiled.definition.executionMode).toBe("single-agent-multi-session");
    expect(compiled.agents.get("seo-operator")?.profile).toBe("ecoi-seo");
    expect(compiled.definition.nodes.filter((node) => "agentId" in node)).toHaveLength(4);
    expect(compiled.definition.nodes.every((node) => !("session" in node) || node.session === "fresh")).toBe(true);
    expect(compiled.topologyHash).toMatch(/^[a-f0-9]{64}$/);
  });

  it("rejects unknown node and agent references", () => {
    const unknownNode = { ...baseGraph, edges: [{ from: "research", to: "missing", type: "control" }] };
    expect(issueCodes(() => compilePromptGraph(unknownNode))).toContain("UNKNOWN_NODE");

    const nodes = baseGraph.nodes.map((node) => node.id === "write"
      ? { ...node, agentId: "missing-agent" }
      : node);
    expect(issueCodes(() => compilePromptGraph({ ...baseGraph, nodes }))).toContain("UNKNOWN_AGENT");
  });

  it("rejects data edges that violate artifact contracts", () => {
    const edges = baseGraph.edges.map((edge) => edge.from === "research"
      ? { ...edge, artifact: "unpublished-artifact" }
      : edge);
    expect(issueCodes(() => compilePromptGraph({ ...baseGraph, edges }))).toContain("ARTIFACT_CONTRACT_MISMATCH");
  });

  it("rejects cycle edges without an explicit traversal cap", () => {
    const edges = baseGraph.edges.map((edge) => edge.from === "review" && edge.to === "write"
      ? { ...edge, maxTraversals: undefined }
      : edge);
    expect(issueCodes(() => compilePromptGraph({ ...baseGraph, edges }))).toContain("UNBOUNDED_CYCLE");
  });

  it("requires idempotency and a resource lock for consequential effects", () => {
    const publish = {
      id: "publish",
      kind: "tool",
      purpose: "Publish the article",
      toolRef: "cms.publish",
      inputs: ["article-draft"],
      outputs: ["publication-result"],
      sideEffect: "consequential",
      resourceLocks: [],
    };
    const nodes = [...baseGraph.nodes, publish];
    const edges = [...baseGraph.edges, { from: "review", to: "publish", type: "control" }];
    const codes = issueCodes(() => compilePromptGraph({ ...baseGraph, nodes, edges }));
    expect(codes).toContain("MISSING_IDEMPOTENCY");
    expect(codes).toContain("MISSING_RESOURCE_LOCK");
  });

  it("warns about data-free sequential edges that may be fake", () => {
    const edges = baseGraph.edges.map((edge) => edge.from === "review" && edge.to === "improve"
      ? { from: "review", to: "improve", type: "control" as const }
      : edge);
    const compiled = compilePromptGraph({ ...baseGraph, edges });
    expect(compiled.warnings).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "POTENTIAL_FAKE_EDGE", from: "review", to: "improve" }),
    ]));
  });

  it("rejects independent nodes that share a hidden resource dependency", () => {
    const start = {
      id: "start",
      kind: "transform",
      purpose: "Start independent research branches",
      transformRef: "graph.start",
      inputs: [],
      outputs: [],
    };
    const marketScan = {
      id: "market-scan",
      kind: "agent",
      purpose: "Scan the market independently",
      agentId: "seo-operator",
      role: "operator",
      promptRef: "prompts/market-scan.md",
      session: "fresh",
      skills: ["openseo"],
      tools: ["openseo.keyword-research"],
      inputs: [],
      outputs: ["market-report"],
      resourceLocks: ["openseo-rate-limit"],
    };
    const shared = [start, marketScan, ...baseGraph.nodes.map((node) => node.id === "research"
      ? { ...node, resourceLocks: ["openseo-rate-limit"] }
      : node)];
    const edges = [
      { from: "start", to: "research", type: "control", dependencyReason: "Begin keyword research" },
      { from: "start", to: "market-scan", type: "control", dependencyReason: "Begin market research" },
      ...baseGraph.edges,
    ];
    const codes = issueCodes(() => compilePromptGraph({
      ...baseGraph,
      entrypoint: "start",
      nodes: shared,
      edges,
    }));
    expect(codes).toContain("HIDDEN_RESOURCE_EDGE");
  });

  it("requires an AI improvement node and immutable protected evidence anchor", () => {
    const deterministicNodes = [
      {
        id: "collect",
        kind: "tool",
        purpose: "Collect metrics",
        toolRef: "analytics.collect",
        inputs: [],
        outputs: ["metrics"],
      },
      {
        id: "improve",
        kind: "transform",
        purpose: "Apply a fixed formula",
        transformRef: "improve.fixed",
        inputs: ["metrics"],
        outputs: ["learning-proposal"],
      },
    ];
    const graph = {
      ...baseGraph,
      executionMode: "deterministic-with-ai-improvement",
      entrypoint: "collect",
      agents: [],
      nodes: deterministicNodes,
      edges: [{ from: "collect", to: "improve", type: "data", artifact: "metrics" }],
      anchors: [],
      improvement: { ...baseGraph.improvement, protectedNodeIds: [] },
    };
    const codes = issueCodes(() => compilePromptGraph(graph));
    expect(codes).toContain("AI_IMPROVEMENT_REQUIRED");
    expect(codes).toContain("EVIDENCE_ANCHOR_REQUIRED");
  });

  it("supports deterministic operation with a model-backed AI improver and no agent profile", () => {
    const graph = {
      ...baseGraph,
      executionMode: "deterministic-with-ai-improvement",
      entrypoint: "collect",
      agents: [],
      nodes: [
        { id: "collect", kind: "tool", purpose: "Collect metrics", toolRef: "analytics.collect", inputs: [], outputs: ["metrics"] },
        { id: "improve", kind: "evaluator", purpose: "Propose an improvement", mode: "ai", modelRef: "runtime-default", promptRef: "prompts/improve.md", criteria: ["measured-impact"], inputs: ["metrics"], outputs: ["learning-proposal"] },
      ],
      edges: [{ from: "collect", to: "improve", type: "data", artifact: "metrics" }],
      anchors: [{ id: "analytics", nodeId: "collect", evidence: "verified analytics export", immutable: true }],
      improvement: { ...baseGraph.improvement, nodeId: "improve", feedbackArtifacts: ["metrics"], protectedNodeIds: ["collect"] },
    };

    const compiled = compilePromptGraph(graph);
    expect(compiled.definition.agents).toEqual([]);
    expect(compiled.definition.executionMode).toBe("deterministic-with-ai-improvement");
  });
});
