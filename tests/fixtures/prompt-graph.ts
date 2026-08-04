import { PromptGraphDefinitionSchema } from "../../src/graph/schemas.js";

export const portableGraph = PromptGraphDefinitionSchema.parse({
  schemaVersion: 1,
  id: "seo-graph",
  loopId: "seo-growth",
  version: 1,
  executionMode: "single-agent-multi-session",
  entrypoint: "research",
  agents: [{
    id: "seo-operator",
    runtime: "portable",
    profile: "ecoi-seo",
    sessionPolicy: "fresh",
    maxConcurrency: 1,
    requiredSkills: ["seo-research", "seo-writing"],
  }],
  budgets: {
    maxSteps: 12,
    maxCost: 8,
    maxDurationSeconds: 3600,
    maxConcurrency: 1,
    maxRetriesPerNode: 1,
  },
  nodes: [
    { id: "research", kind: "agent", purpose: "Research keywords", agentId: "seo-operator", role: "operator", promptRef: "prompts/keyword-research.md", session: "fresh", inputs: [], outputs: ["keyword-brief"] },
    { id: "write", kind: "agent", purpose: "Write article", agentId: "seo-operator", role: "operator", promptRef: "prompts/article-writing.md", session: "fresh", inputs: ["keyword-brief"], outputs: ["article-draft"] },
    { id: "improve", kind: "agent", purpose: "Propose improvements", agentId: "seo-operator", role: "improver", promptRef: "prompts/improve.md", session: "fresh", inputs: ["article-draft"], outputs: ["learning-proposal"] },
  ],
  edges: [
    { from: "research", to: "write", type: "data", artifact: "keyword-brief" },
    { from: "write", to: "improve", type: "data", artifact: "article-draft" },
  ],
  anchors: [{ id: "search-console", nodeId: "research", evidence: "Search Console export", immutable: true }],
  improvement: {
    enabled: true,
    nodeId: "improve",
    feedbackArtifacts: ["article-draft"],
    evaluationSuiteRef: "qa/seo.yaml",
    protectedNodeIds: ["research"],
    proposalPolicy: "human-approved",
    minFeedbackWindows: 3,
  },
});
