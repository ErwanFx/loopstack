import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { runRuntimeValidateCommand } from "../../src/commands/runtime-validate.js";
import { CodexRuntimeAdapter } from "../../src/runtimes/codex.js";
import { LoopDefinitionSchema } from "../../src/domain/schemas.js";

const loop = LoopDefinitionSchema.parse({
  id: "seo-growth",
  name: "SEO Growth",
  version: 1,
  status: "ready",
  target: { metric: "qualified_leads", desired: 40, horizonDays: 90 },
  current: { value: 12, observedAt: "2026-08-01T00:00:00.000Z" },
  triggers: [{ type: "manual" }],
  feedback: [{ metric: "qualified_leads", delayDays: 30 }],
});

async function writeCodexPackage(root: string): Promise<void> {
  const rendered = await new CodexRuntimeAdapter().render({ loop });
  for (const [relative, content] of Object.entries(rendered.files)) {
    const path = join(root, relative);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, content);
  }
}

describe("runtime validate command", () => {
  it("returns success for a valid generated package", async () => {
    const root = mkdtempSync(join(tmpdir(), "loopstack-runtime-valid-"));
    await writeCodexPackage(root);
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);

    const code = await runRuntimeValidateCommand(["--runtime", "codex", "--package", root]);

    expect(code).toBe(0);
    expect(log).toHaveBeenCalledWith(JSON.stringify({
      runtime: "codex", packagePath: root, trust: "self-consistency-only", valid: true, errors: [],
    }));
    log.mockRestore();
  });

  it("returns a structured failure for an invalid package", async () => {
    const root = mkdtempSync(join(tmpdir(), "loopstack-runtime-invalid-"));
    await writeCodexPackage(root);
    writeFileSync(join(root, ".codex-plugin", "plugin.json"), "{}\n");
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);

    const code = await runRuntimeValidateCommand(["--runtime", "codex", "--package", root]);

    expect(code).toBe(2);
    expect(error).toHaveBeenCalledWith(expect.stringContaining('"code":"RUNTIME_VALIDATION_FAILED"'));
    error.mockRestore();
  });
});
