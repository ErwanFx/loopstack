import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { loadLoopDocument, loadRegistryDocument } from "../../src/commands/document-loader.js";
import { runListCommand } from "../../src/commands/list.js";
import { runTransitionCommand } from "../../src/commands/transition.js";
import { runInitBusinessRepoCommand } from "../../src/commands/init-business-repo.js";
import { validateLoopFile } from "../../src/commands/validate.js";

function fixture(name: string, content: string): string {
  const path = join(mkdtempSync(join(tmpdir(), "loopstack-cli-hardening-")), name);
  writeFileSync(path, content);
  return path;
}

const official = `schemaVersion: 3
id: official-v3
name: Official V3
version: 1
status: designing
target: { metric: leads, desired: 3, horizonDays: 30 }
current: { value: 1, observedAt: "2026-08-01T00:00:00.000Z" }
triggers: [{ type: manual }]
feedback: [{ metric: leads, delayDays: 7 }]
`;

describe("canonical CLI document loader", () => {
  it("accepts official top-level v3 and current envelopes without downgrade", () => {
    expect(loadLoopDocument(fixture("loop.yaml", official)).loop.id).toBe("official-v3");
    expect(loadLoopDocument(fixture("loop.json", JSON.stringify({ loop: JSON.parse(JSON.stringify({
      schemaVersion: 3, id: "envelope", name: "Envelope", version: 1, status: "ready",
      target: { metric: "leads", desired: 3, horizonDays: 30 },
      current: { value: 1, observedAt: "2026-08-01T00:00:00.000Z" },
      triggers: [{ type: "manual" }], feedback: [{ metric: "leads", delayDays: 7 }],
    })) }))).loop.id).toBe("envelope");
  });

  it("rejects malformed registries with a clean structured CLI error", () => {
    expect(() => loadRegistryDocument(fixture("registry.yaml", "loops: nope\n"))).toThrow(/registry\.loops/);
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    expect(runListCommand([fixture("registry.yaml", "loops: nope\n")])).toBe(2);
    expect(JSON.parse(String(error.mock.calls[0]?.[0]))).toMatchObject({ code: "INVALID_REGISTRY_FILE" });
    expect(String(error.mock.calls[0]?.[0])).not.toContain("at ");
    error.mockRestore();
  });

  it("never downgrades a malformed document that declares a loop envelope", () => {
    const malformed = fixture("loop.yaml", "loop:\n  id: caller-shaped\nclassificationHints:\n  decisionMode: assisted\n");
    expect(() => loadLoopDocument(malformed)).toThrow(/loop\.loop/);
    expect(() => validateLoopFile(malformed)).toThrow(/loop\.loop/);
  });
});

describe("gated CLI boundaries", () => {
  it("refuses a direct ready-to-active transition without host-trusted evidence", () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    expect(runTransitionCommand(["--from", "canary", "--to", "active"])).toBe(2);
    expect(JSON.parse(String(error.mock.calls[0]?.[0]))).toMatchObject({ code: "HOST_RESOLVER_REQUIRED" });
    error.mockRestore();
  });

  it("never treats a caller-supplied proof file as host trust", () => {
    const proof = fixture("evidence.json", JSON.stringify({
      kind: "lifecycle-transition", from: "canary", to: "active", source: "host-probe",
      executor: "loopstack.lifecycle.transition", evidence: "qa=pass;canary=pass", digest: "a".repeat(64),
    }));
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    expect(runTransitionCommand(["--from", "canary", "--to", "active", "--evidence", proof])).toBe(2);
    expect(JSON.parse(String(error.mock.calls[0]?.[0]))).toMatchObject({ code: "HOST_RESOLVER_REQUIRED" });
    error.mockRestore();
  });

  it("requires an explicit approved overwrite token for --force", () => {
    const target = mkdtempSync(join(tmpdir(), "loopstack-init-hardening-"));
    writeFileSync(join(target, "keep.txt"), "keep");
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    expect(runInitBusinessRepoCommand([target, "--force"])).toBe(2);
    error.mockRestore();
  });

  it("does not accept an arbitrary overwrite token in standalone mode", () => {
    const target = mkdtempSync(join(tmpdir(), "loopstack-init-hardening-"));
    writeFileSync(join(target, "keep.txt"), "keep");
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    expect(runInitBusinessRepoCommand([target, "--force", "--approved-overwrite", "caller-says-yes"])).toBe(2);
    expect(JSON.parse(String(error.mock.calls[0]?.[0]))).toMatchObject({ code: "HOST_RESOLVER_REQUIRED" });
    error.mockRestore();
  });
});
