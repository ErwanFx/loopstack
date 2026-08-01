import { describe, expect, it } from "vitest";
import { LoopDefinitionSchema } from "../../src/domain/schemas.js";
import { ClaudeCodeRuntimeAdapter } from "../../src/runtimes/claude-code.js";
import { HermesRuntimeAdapter } from "../../src/runtimes/hermes.js";
import { normalizeRuntimePackage } from "../../src/runtimes/normalize.js";

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
  it("preserves business semantics across Hermes and Claude Code", async () => {
    const hermes = await new HermesRuntimeAdapter().render({ loop });
    const claude = await new ClaudeCodeRuntimeAdapter().render({ loop });
    expect(normalizeRuntimePackage(hermes)).toEqual(normalizeRuntimePackage(claude));
  });
});
