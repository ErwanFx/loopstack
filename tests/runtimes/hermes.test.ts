import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
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

const exactCronJob = {
  job_id: "opaque-job-123",
  name: "loopstack:default:seo-growth:v1:cron-3",
  schedule: "0 8 * * 1",
  skills: ["seo-growth-loop"],
  workdir: resolve("loops/seo-growth"),
};
const cronInventory = (jobs: unknown[]) => JSON.stringify({ success: true, count: jobs.length, jobs });

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
    const cron = rendered.activationPlan.triggers.find((trigger) => trigger.type === "cron")!;
    const webhook = rendered.activationPlan.triggers.find((trigger) => trigger.type === "webhook")!;
    expect(cron.activation.args).toEqual(expect.arrayContaining(["--deliver", "local"]));
    expect(webhook.activation.args).toEqual(expect.arrayContaining(["--deliver", "log"]));
    expect(Object.values(rendered.files).join("\n")).not.toContain("super-secret-value");
  });

  it("matches the deterministic golden package", async () => {
    const rendered = await new HermesRuntimeAdapter().render({ loop });
    const golden = parse(readFileSync("tests/golden/runtimes/hermes/seo-growth.yaml", "utf8"));
    expect(JSON.parse(rendered.files["runtime.json"])).toEqual(golden);
  });

  it("rejects a package whose activation plan is invalid", async () => {
    const adapter = new HermesRuntimeAdapter();
    const rendered = await adapter.render({ loop });
    const root = mkdtempSync(join(tmpdir(), "loopstack-hermes-package-"));
    for (const [relative, content] of Object.entries(rendered.files)) {
      const path = join(root, relative);
      mkdirSync(dirname(path), { recursive: true });
      writeFileSync(path, content);
    }

    await expect(adapter.validate(root)).resolves.toEqual({ valid: true, errors: [] });
    writeFileSync(join(root, "activation-plan.json"), JSON.stringify({ runtime: "hermes", enabled: true }));
    const invalid = await adapter.validate(root);
    expect(invalid.valid).toBe(false);
    expect(invalid.errors).not.toEqual([]);
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

  it("uses the Hermes 0.19/0.20 gateway contract and detects a disabled webhook platform", async () => {
    const commands: string[][] = [];
    const runner = async (command: string, args: readonly string[]) => {
      commands.push([command, ...args]);
      if (args.join(" ") === "webhook list") {
        return { exitCode: 0, stdout: "Webhook platform is not enabled", stderr: "" };
      }
      if (args.join(" ") === "skills list --enabled-only") {
        return { exitCode: 0, stdout: "seo-growth-loop\n", stderr: "" };
      }
      return { exitCode: 0, stdout: "default\n", stderr: "" };
    };

    const result = await new HermesRuntimeAdapter(runner).preflight({
      loop,
      requiredSkills: ["seo-growth-loop"],
      requiredTools: [],
    });

    expect(commands).toContainEqual(["hermes", "gateway", "status"]);
    expect(commands).toContainEqual(["hermes", "webhook", "list"]);
    expect(commands).toContainEqual(["hermes", "skills", "list", "--enabled-only"]);
    expect(commands).toContainEqual(["hermes", "tools", "list"]);
    expect(commands).not.toContainEqual(["hermes", "gateway", "health"]);
    expect(result.triggerSupport.webhook).toBe(false);
    expect(result.blockers).toContain("webhook_gateway");
    expect(result.triggerSupport).toMatchObject({ event: false, queue: false });
  });

  it("blocks scheduled activation when the Hermes gateway is not running", async () => {
    const adapter = new HermesRuntimeAdapter(async (_command, args) => {
      if (args.join(" ") === "gateway status") return { exitCode: 1, stdout: "not running", stderr: "" };
      if (args.join(" ") === "skills list --enabled-only") {
        return { exitCode: 0, stdout: "seo-growth-loop\n", stderr: "" };
      }
      return { exitCode: 0, stdout: "default\n", stderr: "" };
    });

    const result = await adapter.preflight({
      loop,
      requiredSkills: ["seo-growth-loop"],
      requiredTools: [],
    });

    expect(result.triggerSupport.cron).toBe(false);
    expect(result.blockers).toContain("cron_gateway");
  });

  it("blocks cron readiness when structured host inspection finds no linked job", async () => {
    const commands: string[][] = [];
    const adapter = new HermesRuntimeAdapter(async (command, args) => {
      commands.push([command, ...args]);
      if (args.join(" ") === "cron list --all") return { exitCode: 0, stdout: cronInventory([]), stderr: "" };
      if (args.join(" ") === "skills list --enabled-only") return { exitCode: 0, stdout: "seo-growth-loop\n", stderr: "" };
      return { exitCode: 0, stdout: "default\n", stderr: "" };
    });
    const result = await adapter.preflight({ loop, requiredSkills: ["seo-growth-loop"], requiredTools: [] });
    expect(commands).toContainEqual(["hermes", "cron", "list", "--all"]);
    expect(result.triggerSupport.cron).toBe(false);
    expect(result.blockers).toContain("cron_job:cron-3");
  });

  it("rejects a plausible cron job not bound to the exact loop version", async () => {
    const adapter = new HermesRuntimeAdapter(async (_command, args) => {
      if (args.join(" ") === "cron list --all") {
        return { exitCode: 0, stdout: cronInventory([{ ...exactCronJob, name: "loopstack:default:seo-growth:v2:cron-3" }]), stderr: "" };
      }
      if (args.join(" ") === "skills list --enabled-only") return { exitCode: 0, stdout: "seo-growth-loop\n", stderr: "" };
      return { exitCode: 0, stdout: "default\n", stderr: "" };
    });
    const result = await adapter.preflight({ loop, requiredSkills: ["seo-growth-loop"], requiredTools: [] });
    expect(result.triggerSupport.cron).toBe(false);
    expect(result.blockers).toContain("cron_job:cron-3");
  });

  it("accepts only an exact structured cron job and observes its opaque removal id", async () => {
    const commands: string[][] = [];
    const adapter = new HermesRuntimeAdapter(async (command, args) => {
      commands.push([command, ...args]);
      if (args.join(" ") === "cron list --all") return { exitCode: 0, stdout: cronInventory([exactCronJob]), stderr: "" };
      if (args.join(" ") === "skills list --enabled-only") return { exitCode: 0, stdout: "seo-growth-loop\n", stderr: "" };
      return { exitCode: 0, stdout: "default\n", stderr: "" };
    });
    const result = await adapter.preflight({ loop, requiredSkills: ["seo-growth-loop"], requiredTools: [] });
    expect(result.triggerSupport.cron).toBe(true);
    expect(result.blockers).not.toContain("cron_job:cron-3");
    expect(commands.some((command) => command.includes("create") || command.includes("update"))).toBe(false);
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
    expect(rendered.activationPlan.profile).toBe("ecoi-seo");
    for (const trigger of rendered.activationPlan.triggers) {
      expect(trigger.activation.args.slice(0, 2)).toEqual(["-p", "ecoi-seo"]);
    }
  });

  it("scopes read-only preflight commands to the selected Hermes profile", async () => {
    const commands: string[][] = [];
    const adapter = new HermesRuntimeAdapter(async (command, args) => {
      commands.push([command, ...args]);
      if (args.includes("cron")) return {
        exitCode: 0,
        stdout: cronInventory([{ ...exactCronJob, name: "loopstack:ecoi-seo:seo-growth:v1:cron-3" }]),
        stderr: "",
      };
      if (args.includes("skills")) return { exitCode: 0, stdout: "seo-growth-loop\n", stderr: "" };
      if (args.includes("tools")) return { exitCode: 0, stdout: "✓ enabled web\n", stderr: "" };
      return { exitCode: 0, stdout: "ecoi-seo\n", stderr: "" };
    });

    const result = await adapter.preflight({
      loop,
      profile: "ecoi-seo",
      requiredSkills: ["seo-growth-loop"],
      requiredTools: ["web"],
    });

    expect(commands).toContainEqual(["hermes", "-p", "ecoi-seo", "gateway", "status"]);
    expect(commands).toContainEqual(["hermes", "-p", "ecoi-seo", "skills", "list", "--enabled-only"]);
    expect(commands).toContainEqual(["hermes", "-p", "ecoi-seo", "tools", "list"]);
    expect(result.blockers).toEqual([]);
  });

  it("rejects an unsafe Hermes profile selector", async () => {
    await expect(new HermesRuntimeAdapter().render({ loop, profile: "--default" }))
      .rejects.toThrow("Invalid Hermes profile");
  });

  it("blocks missing graph profiles and skills using read-only list commands", async () => {
    const commands: string[][] = [];
    const runner = async (command: string, args: readonly string[]) => {
      commands.push([command, ...args]);
      if (args.join(" ") === "profile list") return { exitCode: 0, stdout: "default\n", stderr: "" };
      if (args.join(" ") === "skills list --enabled-only") return { exitCode: 0, stdout: "seo-research\n", stderr: "" };
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

  it("requires exact profile and skill identities instead of substring matches", async () => {
    const adapter = new HermesRuntimeAdapter(async (_command, args) => {
      if (args.join(" ") === "profile list") return { exitCode: 0, stdout: "ecoi-seo-old\n", stderr: "" };
      if (args.includes("skills")) return { exitCode: 0, stdout: "seo-growth-loop-old\n", stderr: "" };
      return { exitCode: 0, stdout: "ok\n", stderr: "" };
    });
    const result = await adapter.preflight({
      loop,
      profile: "ecoi-seo",
      requiredSkills: ["seo-growth-loop"],
      requiredTools: [],
    });
    expect(result.blockers).toEqual(expect.arrayContaining(["profile:ecoi-seo", "skill:seo-growth-loop"]));
    expect(result.authenticatedProfile).toBe(false);
  });

  it("verifies enabled built-in and MCP tools without changing their configuration", async () => {
    const commands: string[][] = [];
    const adapter = new HermesRuntimeAdapter(async (command, args) => {
      commands.push([command, ...args]);
      if (args.join(" ") === "tools list") {
        return {
          exitCode: 0,
          stdout: "✓ enabled  web\nopenseo  all tools enabled\n✗ disabled  crm\n",
          stderr: "",
        };
      }
      if (args.join(" ") === "skills list --enabled-only") {
        return { exitCode: 0, stdout: "seo-growth-loop\n", stderr: "" };
      }
      return { exitCode: 0, stdout: "default\n", stderr: "" };
    });

    const result = await adapter.preflight({
      loop,
      requiredSkills: ["seo-growth-loop"],
      requiredTools: ["web", "openseo:keywords", "mcp__openseo__keywords", "crm", "documents"],
    });

    expect(commands).toContainEqual(["hermes", "tools", "list"]);
    expect(result.blockers).toEqual(expect.arrayContaining(["tool:crm", "tool:documents"]));
    expect(result.blockers).not.toContain("tool:web");
    expect(result.blockers).not.toContain("tool:openseo:keywords");
    expect(result.blockers).not.toContain("tool:mcp__openseo__keywords");
    expect(commands.some((command) => command.includes("enable"))).toBe(false);
  });
});
