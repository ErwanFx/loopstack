import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
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
    expect(JSON.parse(readFileSync(join(outputPath, "runtime.json"), "utf8")).graphExecution)
      .toMatchObject({ executionMode: "single-agent-multi-session", entrypoint: "research" });
  });
});
