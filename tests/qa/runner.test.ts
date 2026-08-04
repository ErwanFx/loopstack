import { describe, expect, it } from "vitest";
import {
  InMemoryQaTrustRegistry,
  runQa,
  type QaInput,
  type QaTrustRecord,
} from "../../src/qa/runner.js";

const loopId = "seo-growth";
const scopeHash = "a".repeat(64);
const artifactHash = "b".repeat(64);
const gates = ["static", "connections", "storage-contract", "scenarios", "approvals", "idempotency", "alerts", "canary"] as const;

const passing: QaInput = {
  manifest: "valid",
  connections: "verified",
  storageContract: "verified",
  scenarios: "pass",
  approvals: "pass",
  idempotency: "pass",
  alerts: "pass",
  canary: "pass",
  loopId,
  scopeHash,
  artifactHash,
  evidenceIds: Object.fromEntries(gates.map((gate) => [gate, `opaque-${gate}`])),
};

function trustedRecords(overrides: Partial<QaTrustRecord> = {}): QaTrustRecord[] {
  return gates.map((gate) => ({
    evidenceId: `opaque-${gate}`,
    loopId,
    scopeHash,
    artifactHash,
    gate,
    status: "pass",
    issuedAt: "2026-08-04T12:00:00.000Z",
    expiresAt: "2026-08-04T16:00:00.000Z",
    nonce: `nonce-${gate}`,
    ...overrides,
  }));
}

const now = new Date("2026-08-04T14:00:00.000Z");

describe("ordered QA runner", () => {
  it("reports structural success as non-authoritative without an external registry", async () => {
    const report = await runQa(passing, undefined, now);
    expect(report.verdict).toBe("blocked");
    expect(report.authoritative).toBe(false);
    expect(report.blockers[0].code).toBe("EXTERNAL_TRUST_REGISTRY_REQUIRED");
  });

  it("rejects a forged caller evidence id", async () => {
    const forged = structuredClone(passing);
    forged.evidenceIds.static = "caller-forged";
    const report = await runQa(forged, new InMemoryQaTrustRegistry(trustedRecords()), now);
    expect(report.verdict).toBe("blocked");
    expect(report.authoritative).toBe(true);
  });

  it("binds trusted evidence to the exact loop scope artifact gate and time", async () => {
    for (const override of [
      { loopId: "other-loop" },
      { scopeHash: "c".repeat(64) },
      { artifactHash: "d".repeat(64) },
      { gate: "other-gate" },
      { expiresAt: "2026-08-04T13:00:00.000Z" },
      { issuedAt: "2026-08-04T15:00:00.000Z" },
    ]) {
      const records = trustedRecords();
      Object.assign(records[0]!, override);
      expect((await runQa(passing, new InMemoryQaTrustRegistry(records), now)).verdict).toBe("blocked");
    }
  });

  it("rejects malformed, unordered, and stale trust record timestamps", async () => {
    for (const override of [
      { issuedAt: "not-a-date" },
      { expiresAt: "not-a-date" },
      { issuedAt: "2026-08-04T15:00:00.000Z", expiresAt: "2026-08-04T14:30:00.000Z" },
      { issuedAt: "2026-08-04T12:00:00.000Z", expiresAt: "2026-08-04T14:00:00.000Z" },
    ]) {
      const records = trustedRecords();
      Object.assign(records[0]!, override);
      expect((await runQa(passing, new InMemoryQaTrustRegistry(records), now)).verdict).toBe("blocked");
    }
  });

  it("consumes each nonce so an authoritative QA pass cannot be replayed", async () => {
    const registry = new InMemoryQaTrustRegistry(trustedRecords());
    const first = await runQa(passing, registry, now);
    expect(first).toMatchObject({ verdict: "pass", authoritative: true });
    expect((await runQa(passing, registry, now)).verdict).toBe("blocked");
  });

  it("blocks activation when one mandatory structural gate fails", async () => {
    const report = await runQa({ ...passing, idempotency: "fail" }, new InMemoryQaTrustRegistry(trustedRecords()), now);
    expect(report.verdict).toBe("blocked");
    expect(report.gates.at(-1)?.name).toBe("idempotency");
  });

  it("passes only with structural success plus separately resolved host evidence", async () => {
    const report = await runQa(passing, new InMemoryQaTrustRegistry(trustedRecords()), now);
    expect(report.verdict).toBe("pass");
    expect(report.authoritative).toBe(true);
    expect(report.gates.every((gate) => gate.status === "pass")).toBe(true);
    expect(report.markdown).toContain("QA verdict: pass");
  });
});
