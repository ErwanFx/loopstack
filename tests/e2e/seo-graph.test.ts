import { readFileSync } from "node:fs";
import { parse } from "yaml";
import { describe, expect, it } from "vitest";
import { compilePromptGraph } from "../../src/graph/compiler.js";
import { HermesRuntimeAdapter } from "../../src/runtimes/hermes.js";
import { ClaudeCodeRuntimeAdapter } from "../../src/runtimes/claude-code.js";
import { CodexRuntimeAdapter } from "../../src/runtimes/codex.js";
import { LoopDefinitionSchema } from "../../src/domain/schemas.js";

const loop = LoopDefinitionSchema.parse({
  id: "seo-content",
  name: "SEO Content",
  version: 1,
  status: "ready",
  target: { metric: "organic_qualified_visits", desired: 1000, horizonDays: 90 },
  current: { value: 0, observedAt: "2026-08-04T00:00:00.000Z" },
  triggers: [{ type: "cron", configuration: { schedule: "0 8 * * 1" } }],
  feedback: [{ metric: "organic_qualified_visits", delayDays: 30 }],
});

describe("SEO prompt graph example", () => {
  it("uses one agent profile in fresh sessions and renders on every supported runtime", async () => {
    const definition = parse(readFileSync("examples/seo/graph.yaml", "utf8"));
    const compiled = compilePromptGraph(definition);

    expect(compiled.definition.executionMode).toBe("single-agent-multi-session");
    expect(new Set(compiled.definition.nodes
      .filter((node) => "agentId" in node)
      .map((node) => "agentId" in node ? node.agentId : undefined))).toEqual(new Set(["seo-operator"]));
    expect(compiled.definition.nodes.filter((node) => "session" in node).every((node) => node.session === "fresh")).toBe(true);
    expect(compiled.definition.nodes).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: "human-gate" }),
      expect.objectContaining({ id: "publish", sideEffect: "consequential" }),
      expect.objectContaining({ id: "improve", role: "improver" }),
    ]));

    for (const adapter of [new HermesRuntimeAdapter(), new ClaudeCodeRuntimeAdapter(), new CodexRuntimeAdapter()]) {
      const rendered = await adapter.render({ loop, graph: compiled.definition });
      expect(rendered.files["graph.json"]).toBeDefined();
      expect(rendered.graphExecution?.topologyHash).toBe(compiled.topologyHash);
    }
  });
});
