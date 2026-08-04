import { readFileSync } from "node:fs";
import { parse } from "yaml";
import { describe, expect, it } from "vitest";
import { LoopDefinitionSchema } from "../../src/domain/schemas.js";
import { HermesRuntimeAdapter } from "../../src/runtimes/hermes.js";
import { portableGraph } from "../fixtures/prompt-graph.js";

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

  it("reuses one Hermes profile in fresh sequential sessions", async () => {
    const rendered = await new HermesRuntimeAdapter().render({ loop, graph: portableGraph });

    expect(rendered.graphExecution).toMatchObject({
      executionMode: "single-agent-multi-session",
      capabilities: { freshSessions: true, maxConcurrency: 1, sequentialFallback: true },
      agentBindings: [{ profile: "ecoi-seo", sessionPolicy: "fresh", maxConcurrency: 1 }],
    });
    expect(JSON.parse(rendered.files["graph.json"]).nodes.map((node: { agentId?: string }) => node.agentId))
      .toEqual(["seo-operator", "seo-operator", "seo-operator"]);
  });

  it("blocks missing graph profiles and skills using read-only list commands", async () => {
    const commands: string[][] = [];
    const runner = async (command: string, args: readonly string[]) => {
      commands.push([command, ...args]);
      if (args.join(" ") === "profile list") return { exitCode: 0, stdout: "default\n", stderr: "" };
      if (args.join(" ") === "skills list") return { exitCode: 0, stdout: "seo-research\n", stderr: "" };
      return { exitCode: 0, stdout: "ok", stderr: "" };
    };
    const result = await new HermesRuntimeAdapter(runner).preflight({
      loop,
      graph: portableGraph,
      requiredSkills: [],
      requiredTools: [],
    });

    expect(result.blockers).toEqual(expect.arrayContaining([
      "profile:ecoi-seo",
      "skill:seo-writing",
    ]));
    expect(commands.some((command) => command.includes("create"))).toBe(false);
  });
});
