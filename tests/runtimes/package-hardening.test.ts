import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";
import { LoopDefinitionSchema } from "../../src/domain/schemas.js";
import { ClaudeCodeRuntimeAdapter } from "../../src/runtimes/claude-code.js";
import { CodexRuntimeAdapter } from "../../src/runtimes/codex.js";
import { HermesRuntimeAdapter } from "../../src/runtimes/hermes.js";
import { authorizeRuntimePackage, packageManifestDigest } from "../../src/runtimes/package-integrity.js";

const loop = LoopDefinitionSchema.parse({
  id: "package-check", name: "Package Check", version: 7, status: "ready",
  target: { metric: "quality", desired: 1, horizonDays: 30 },
  current: { value: 0, observedAt: "2026-08-01T00:00:00.000Z" },
  triggers: [{ type: "manual" }], feedback: [{ metric: "quality", delayDays: 1 }],
});

function writePackage(files: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), "loopstack-package-hardening-"));
  for (const [relative, content] of Object.entries(files)) {
    const path = join(root, relative);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, content);
  }
  return root;
}

describe.each([
  ["claude-code", new ClaudeCodeRuntimeAdapter()],
  ["codex", new CodexRuntimeAdapter()],
  ["hermes", new HermesRuntimeAdapter()],
] as const)("%s package integrity", (_runtime, adapter) => {
  it("binds the exact loop, version, files, and file hashes", async () => {
    const rendered = await adapter.render({ loop });
    const manifest = JSON.parse(rendered.files["package-manifest.json"]!);
    expect(manifest).toMatchObject({ runtime: adapter.name, loopId: loop.id, version: loop.version });
    expect(Object.keys(manifest.files).sort()).toEqual(Object.keys(rendered.files).filter((name) => name !== "package-manifest.json").sort());
    for (const [name, digest] of Object.entries(manifest.files)) {
      expect(digest).toBe(createHash("sha256").update(rendered.files[name]!).digest("hex"));
    }
    await expect(adapter.validate(writePackage(rendered.files))).resolves.toEqual({ valid: true, errors: [] });
  });

  it("rejects a tampered or undeclared file", async () => {
    const rendered = await adapter.render({ loop });
    const tampered = { ...rendered.files, "runtime.json": `${rendered.files["runtime.json"]} ` };
    expect((await adapter.validate(writePackage(tampered))).valid).toBe(false);
    const extra = { ...rendered.files, "caller-assertion.json": "{}\n" };
    expect((await adapter.validate(writePackage(extra))).valid).toBe(false);
  });

  it("treats a regenerated manifest as self-consistent but not externally authorized", async () => {
    const original = await adapter.render({ loop });
    const expectedDigest = packageManifestDigest(original.files["package-manifest.json"]!);
    const regenerated = await adapter.render({ loop: { ...loop, name: "Caller Regenerated" } });
    const root = writePackage(regenerated.files);
    expect((await adapter.validate(root)).valid).toBe(true);
    await expect(authorizeRuntimePackage(root, adapter.name, expectedDigest)).resolves.toMatchObject({ authorized: false });
    await expect(authorizeRuntimePackage(root, adapter.name, packageManifestDigest(regenerated.files["package-manifest.json"]!)))
      .resolves.toMatchObject({ authorized: true });
  });
});
