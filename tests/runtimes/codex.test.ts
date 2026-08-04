import { describe, expect, it } from "vitest";
import { LoopDefinitionSchema } from "../../src/domain/schemas.js";
import { CodexRuntimeAdapter } from "../../src/runtimes/codex.js";
import { portableGraph } from "../fixtures/prompt-graph.js";

const loop = LoopDefinitionSchema.parse({
  id: "pv-admin",
  name: "PV administration",
  version: 1,
  status: "ready",
  architectureShape: "workflow-with-control-loop",
  target: { metric: "dossier_cycle_hours", desired: 192, direction: "at-most", horizonDays: 90 },
  current: { value: 260, observedAt: "2026-08-01T00:00:00.000Z" },
  triggers: [
    { id: "manual-review", type: "manual", role: "resume" },
    { id: "visit-validated", type: "event", source: "crm", event: "visit.validated", idempotencyKey: "client+version" },
  ],
  feedback: [{ metric: "dossier_cycle_hours", delayDays: 30 }],
  guardrails: [{
    metric: "rejection_rate",
    operator: "lte",
    threshold: 0.08,
    sourceOfTruth: "crm",
    evaluationWindowDays: 90,
    onBreach: "pause",
  }],
  serviceLevels: [{ metric: "dossier_cycle_hours", operator: "lte", threshold: 192, appliesTo: 0.9 }],
});

describe("Codex graph execution", () => {
  it("renders the portable graph with fresh sessions and a sequential fallback", async () => {
    const rendered = await new CodexRuntimeAdapter().render({
      loop,
      graph: { ...portableGraph, loopId: loop.id },
    });
    expect(rendered.graphExecution).toMatchObject({
      executionMode: "single-agent-multi-session",
      capabilities: { freshSessions: true, sequentialFallback: true },
    });
    expect(rendered.files["graph.json"]).toBeDefined();
  });
});

describe("Codex runtime adapter", () => {
  it("renders an inert plugin package and external trigger contract", async () => {
    const rendered = await new CodexRuntimeAdapter().render({
      loop,
      skills: ["pv-admin-playbook", "document-qa"],
      allowedTools: ["crm.read", "documents.read"],
    });

    expect(rendered.runtime).toBe("codex");
    expect(rendered.triggers).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: "manual", role: "resume", enabled: false }),
      expect.objectContaining({ type: "event", external: true, enabled: false, idempotencyKey: "client+version" }),
    ]));
    expect(rendered.guardrails).toEqual(loop.guardrails);
    expect(rendered.serviceLevels).toEqual(loop.serviceLevels);
    expect(rendered.promptCycle.entry).toEqual({
      executable: "loopstack",
      args: ["prompt-cycle", "run", "--loop", "pv-admin"],
    });
    expect(rendered.externalTriggerRequirements[0]).toContain("idempotency key");
    expect(Object.keys(rendered.files)).toEqual(expect.arrayContaining([
      "runtime.json",
      ".codex-plugin/plugin.json",
      "tool-policy.json",
      "skill-wrapper.md",
    ]));
    expect(JSON.parse(rendered.files[".codex-plugin/plugin.json"])).toMatchObject({
      name: "loopstack-pv-admin",
      version: "1",
    });
  });

  it("preflights Codex without changing local configuration", async () => {
    const calls: Array<{ command: string; args: readonly string[] }> = [];
    const adapter = new CodexRuntimeAdapter(async (command, args) => {
      calls.push({ command, args });
      return { exitCode: 0, stdout: "ok", stderr: "" };
    });
    const result = await adapter.preflight({
      loop,
      requiredSkills: ["pv-admin-playbook"],
      requiredTools: [],
    });

    expect(calls).toEqual([
      { command: "codex", args: ["--version"] },
      { command: "codex", args: ["plugin", "list"] },
    ]);
    expect(result).toMatchObject({ runtime: "codex", cliPresent: true, skillsDirectory: true });
  });
});
