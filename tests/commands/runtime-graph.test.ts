import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { runRuntimeRenderCommand } from "../../src/commands/runtime-render.js";
import { portableGraph } from "../fixtures/prompt-graph.js";

describe("runtime graph command", () => {
  it("accepts --graph and writes the canonical graph package", async () => {
    const root = mkdtempSync(join(tmpdir(), "loopstack-runtime-graph-"));
    const loopPath = join(root, "loop.yaml");
    const graphPath = join(root, "graph.yaml");
    const outputPath = join(root, "rendered");
    writeFileSync(loopPath, readFileSync("tests/fixtures/processes/seo-valid.yaml", "utf8"));
    writeFileSync(graphPath, JSON.stringify(portableGraph));
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);

    const code = await runRuntimeRenderCommand([
      "--runtime", "codex",
      "--loop", loopPath,
      "--graph", graphPath,
      "--out", outputPath,
    ]);

    log.mockRestore();
    expect(code).toBe(0);
    expect(existsSync(join(outputPath, "graph.json"))).toBe(true);
    const runtime = JSON.parse(readFileSync(join(outputPath, "runtime.json"), "utf8"));
    expect(runtime.graphExecution).toMatchObject({ executionMode: "single-agent-multi-session", entrypoint: "research" });
    expect(runtime.workDirectory).toBe(dirname(loopPath));
    expect(runtime.promptCycle.entry.args).toEqual(["prompt-cycle", "run", "--loop", dirname(loopPath)]);
  });

  it("renders an inert schema-valid package while explicitly reporting build-not-ready", async () => {
    const root = mkdtempSync(join(tmpdir(), "loopstack-runtime-inert-"));
    const loopPath = join(root, "loop.yaml");
    const outputPath = join(root, "rendered");
    writeFileSync(loopPath, `schemaVersion: 3
id: inert-loop
name: Inert Loop
version: 1
status: designing
target: { metric: leads, desired: 3, horizonDays: 30 }
current: { value: 1, observedAt: "2026-08-01T00:00:00.000Z" }
triggers: [{ type: manual }]
feedback: [{ metric: leads, delayDays: 7 }]
`);
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    expect(await runRuntimeRenderCommand(["--runtime", "codex", "--loop", loopPath, "--out", outputPath])).toBe(0);
    expect(JSON.parse(String(log.mock.calls[0]?.[0]))).toMatchObject({
      schemaValid: true,
      buildReady: false,
      triggersEnabled: false,
      packageTrust: "self-consistency-only",
    });
    expect(existsSync(join(outputPath, "package-manifest.json"))).toBe(true);
    log.mockRestore();
  });
});
