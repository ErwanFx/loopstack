import { readFileSync } from "node:fs";
import { parse } from "yaml";
import { describe, expect, it } from "vitest";
import { LoopDefinitionSchema } from "../../src/domain/schemas.js";
import { HermesRuntimeAdapter } from "../../src/runtimes/hermes.js";

const loop = LoopDefinitionSchema.parse({
  id: "seo-growth",
  name: "SEO Growth",
  version: 1,
  status: "ready",
  target: { metric: "qualified_leads", desired: 40, horizonDays: 90 },
  current: { value: 12, observedAt: "2026-08-01T00:00:00.000Z" },
  triggers: [
    { type: "manual" },
    { type: "webhook" },
    { type: "cron", configuration: { schedule: "0 8 * * 1" } },
  ],
  feedback: [{ metric: "qualified_leads", delayDays: 30 }],
});

describe("Hermes runtime adapter", () => {
  it("renders disabled manual, webhook, and schedule triggers safely", async () => {
    const rendered = await new HermesRuntimeAdapter().render({ loop });
    expect(rendered.triggers).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: "manual", enabled: false }),
      expect.objectContaining({ type: "webhook", enabled: false }),
      expect.objectContaining({ type: "schedule", enabled: false, schedule: "0 8 * * 1" }),
    ]));
    expect(rendered.webhook.skills).toContain("seo-growth-loop");
    expect(rendered.webhook.secretEnv).toBe("LOOPSTACK_SEO_GROWTH_WEBHOOK_SECRET");
    expect(rendered.deliveryTarget).toBe("log");
    expect(Object.values(rendered.files).join("\n")).not.toContain("super-secret-value");
  });

  it("matches the deterministic golden package", async () => {
    const rendered = await new HermesRuntimeAdapter().render({ loop });
    const golden = parse(readFileSync("tests/golden/runtimes/hermes/seo-growth.yaml", "utf8"));
    expect(JSON.parse(rendered.files["runtime.json"])).toEqual(golden);
  });

  it("reports missing Hermes profile without mutating it", async () => {
    const runner = async (_command: string, args: readonly string[]) => ({
      exitCode: args.includes("profile") ? 1 : 0,
      stdout: "",
      stderr: "",
    });
    const result = await new HermesRuntimeAdapter(runner).preflight({
      loop,
      requiredSkills: ["seo-growth-loop"],
      requiredTools: [],
    });
    expect(result.authenticatedProfile).toBe(false);
    expect(result.blockers).toContain("authenticated_profile");
  });
});
