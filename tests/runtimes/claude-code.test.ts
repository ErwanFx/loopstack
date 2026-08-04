import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { LoopDefinitionSchema } from "../../src/domain/schemas.js";
import { ClaudeCodeRuntimeAdapter } from "../../src/runtimes/claude-code.js";
import { portableGraph } from "../fixtures/prompt-graph.js";

const loop = LoopDefinitionSchema.parse({
  id: "seo-growth",
  name: "SEO Growth",
  version: 1,
  status: "ready",
  target: { metric: "qualified_leads", desired: 40, horizonDays: 90 },
  current: { value: 12, observedAt: "2026-08-01T00:00:00.000Z" },
  triggers: [{ type: "manual" }, { type: "webhook" }, { type: "cron", configuration: { schedule: "0 8 * * 1" } }],
  feedback: [{ metric: "qualified_leads", delayDays: 30 }],
});

describe("Claude Code graph execution", () => {
  it("renders the portable graph with optional dynamic workflows and a sequential fallback", async () => {
    const rendered = await new ClaudeCodeRuntimeAdapter().render({ loop, graph: portableGraph });
    expect(rendered.graphExecution).toMatchObject({
      executionMode: "single-agent-multi-session",
      capabilities: { dynamicWorkflow: "optional", freshSessions: true, sequentialFallback: true },
    });
    expect(rendered.files["graph.json"]).toBeDefined();
  });
});

describe("Claude Code runtime adapter", () => {
  it("preserves routes and approval stops with least privilege", async () => {
    const rendered = await new ClaudeCodeRuntimeAdapter().render({
      loop,
      allowedTools: ["WebSearch", "mcp__openseo__keywords"],
    });
    expect(rendered.manifestVersion).toBe(1);
    expect(rendered.skills).toEqual(["seo-growth-loop"]);
    expect(rendered.approvalRequired).toBe(true);
    expect(rendered.permissions.allow).toEqual(["WebSearch", "mcp__openseo__keywords"]);
    expect(rendered.triggers).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: "webhook", enabled: false, external: true }),
      expect.objectContaining({ type: "cron", enabled: false, external: true }),
    ]));
  });

  it("matches the deterministic golden package", async () => {
    const rendered = await new ClaudeCodeRuntimeAdapter().render({ loop });
    const golden = JSON.parse(readFileSync("tests/golden/runtimes/claude-code/seo-growth.json", "utf8"));
    expect(JSON.parse(rendered.files["runtime.json"])).toEqual(golden);
  });
});
