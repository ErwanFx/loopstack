import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
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

  it("renders and semantically validates an installable Claude plugin", async () => {
    const adapter = new ClaudeCodeRuntimeAdapter();
    const rendered = await adapter.render({ loop });
    const root = mkdtempSync(join(tmpdir(), "loopstack-claude-package-"));
    for (const [relative, content] of Object.entries(rendered.files)) {
      const path = join(root, relative);
      mkdirSync(dirname(path), { recursive: true });
      writeFileSync(path, content);
    }

    expect(JSON.parse(rendered.files[".claude-plugin/plugin.json"]!)).toMatchObject({
      name: "loopstack-seo-growth",
      version: "1.0.0",
      author: { name: "Loopstack" },
    });
    expect(rendered.files["skills/seo-growth-loop/SKILL.md"]).toContain("name: seo-growth-loop");
    await expect(adapter.validate(root)).resolves.toEqual({ valid: true, errors: [] });
  });

  it("preflights authentication, the generated wrapper, and required tools read-only", async () => {
    const calls: string[][] = [];
    const adapter = new ClaudeCodeRuntimeAdapter(async (command, args) => {
      calls.push([command, ...args]);
      const joined = args.join(" ");
      if (joined === "auth status") return { exitCode: 0, stdout: JSON.stringify({ loggedIn: true }), stderr: "" };
      if (joined === "plugin list --json") {
        return {
          exitCode: 0,
          stdout: JSON.stringify([{ id: "loopstack-seo-growth@local", enabled: true }]),
          stderr: "",
        };
      }
      if (joined === "mcp list") return { exitCode: 0, stdout: "openseo: connected\n", stderr: "" };
      return { exitCode: 0, stdout: "2.1.205", stderr: "" };
    });

    const result = await adapter.preflight({
      loop,
      requiredSkills: ["seo-growth-loop"],
      requiredTools: ["openseo"],
    });

    expect(calls).toEqual([
      ["claude", "--version"],
      ["claude", "auth", "status"],
      ["claude", "plugin", "list", "--json"],
      ["claude", "mcp", "list"],
    ]);
    expect(result.blockers).toEqual([]);
    expect(result).toMatchObject({ authenticatedProfile: true, skillsDirectory: true });
  });

  it("blocks a missing login, loop wrapper, and required tool", async () => {
    const adapter = new ClaudeCodeRuntimeAdapter(async (_command, args) => {
      const joined = args.join(" ");
      if (joined === "auth status") return { exitCode: 1, stdout: JSON.stringify({ loggedIn: false }), stderr: "" };
      if (joined === "plugin list --json") return { exitCode: 0, stdout: "[]", stderr: "" };
      if (joined === "mcp list") return { exitCode: 0, stdout: "", stderr: "" };
      return { exitCode: 0, stdout: "2.1.205", stderr: "" };
    });

    const result = await adapter.preflight({ loop, requiredSkills: [], requiredTools: ["openseo"] });

    expect(result.blockers).toEqual(expect.arrayContaining([
      "authenticated_profile",
      "runtime_package:loopstack-seo-growth",
      "tool:openseo",
    ]));
  });

  it("requires the exact structured Claude authentication assertion", async () => {
    const adapter = new ClaudeCodeRuntimeAdapter(async (_command, args) => {
      const joined = args.join(" ");
      if (joined === "auth status") return { exitCode: 0, stdout: "authentication check passed", stderr: "" };
      if (joined === "plugin list --json") return { exitCode: 0, stdout: JSON.stringify([{ id: "loopstack-seo-growth", enabled: true }]), stderr: "" };
      return { exitCode: 0, stdout: "[]", stderr: "" };
    });
    expect((await adapter.preflight({ loop, requiredSkills: [], requiredTools: [] })).authenticatedProfile).toBe(false);
  });
});
