import { describe, expect, it } from "vitest";
import { LoopDefinitionSchema } from "../../src/domain/schemas.js";
import { ClaudeCodeRuntimeAdapter } from "../../src/runtimes/claude-code.js";
import { CodexRuntimeAdapter } from "../../src/runtimes/codex.js";
import { HermesRuntimeAdapter } from "../../src/runtimes/hermes.js";
import { normalizeRuntimePackage } from "../../src/runtimes/normalize.js";
import { portableGraph } from "../fixtures/prompt-graph.js";

const loop = LoopDefinitionSchema.parse({
  id: "seo-growth",
  name: "SEO Growth",
  version: 1,
  status: "ready",
  target: { metric: "qualified_leads", desired: 40, horizonDays: 90 },
  current: { value: 12, observedAt: "2026-08-01T00:00:00.000Z" },
  triggers: [{ type: "cron", configuration: { schedule: "0 8 * * 1" } }],
  feedback: [{ metric: "qualified_leads", delayDays: 30 }],
});

describe("runtime equivalence", () => {
  it("preserves business semantics across Hermes, Claude Code, and Codex", async () => {
    const hermes = await new HermesRuntimeAdapter().render({ loop });
    const claude = await new ClaudeCodeRuntimeAdapter().render({ loop });
    const codex = await new CodexRuntimeAdapter().render({ loop });
    expect(normalizeRuntimePackage(hermes)).toEqual(normalizeRuntimePackage(claude));
    expect(normalizeRuntimePackage(hermes)).toEqual(normalizeRuntimePackage(codex));
  });

  it("preserves the canonical prompt graph across all runtime packages", async () => {
    const hermes = await new HermesRuntimeAdapter().render({ loop, graph: portableGraph });
    const claude = await new ClaudeCodeRuntimeAdapter().render({ loop, graph: portableGraph });
    const codex = await new CodexRuntimeAdapter().render({ loop, graph: portableGraph });

    expect(normalizeRuntimePackage(hermes)).toEqual(normalizeRuntimePackage(claude));
    expect(normalizeRuntimePackage(hermes)).toEqual(normalizeRuntimePackage(codex));
    expect(JSON.parse(hermes.files["graph.json"])).toEqual(JSON.parse(claude.files["graph.json"]));
    expect(JSON.parse(hermes.files["graph.json"])).toEqual(JSON.parse(codex.files["graph.json"]));
  });
});
