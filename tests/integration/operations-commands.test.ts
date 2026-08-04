import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { evaluateQaFile } from "../../src/commands/qa.js";
import { monitorRunsFile } from "../../src/commands/monitor.js";


describe("operations CLI helpers", () => {
  it("keeps caller-supplied QA files structural and non-authoritative", async () => {
    const path = join(mkdtempSync(join(tmpdir(), "loopstack-qa-")), "qa.json");
    const gates = ["static", "connections", "storage-contract", "scenarios", "approvals", "idempotency", "alerts", "canary"];
    writeFileSync(path, JSON.stringify({
      manifest: "valid", connections: "verified", storageContract: "verified", scenarios: "pass",
      approvals: "pass", idempotency: "pass", alerts: "pass", canary: "pass", loopId: "seo-growth",
      scopeHash: "a".repeat(64), artifactHash: "b".repeat(64),
      evidenceIds: Object.fromEntries(gates.map((gate) => [gate, `caller-${gate}`])),
    }));
    expect(await evaluateQaFile(path)).toMatchObject({ verdict: "blocked", authoritative: false });
  });

  it("finds stale runs from a heartbeat file", () => {
    const path = join(mkdtempSync(join(tmpdir(), "loopstack-monitor-")), "runs.json");
    writeFileSync(path, JSON.stringify([{ loopId: "seo-growth", runId: "run-1", status: "running", heartbeatAt: "2026-08-01T10:00:00.000Z" }]));
    expect(monitorRunsFile(path, "2026-08-01T12:00:00.000Z", 60_000)[0].alertCode).toBe("STALE_HEARTBEAT");
  });
});
