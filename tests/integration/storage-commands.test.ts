import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { generateStoragePlan } from "../../src/commands/storage-plan.js";
import { verifyStorageFiles } from "../../src/commands/storage-verify.js";

describe("storage artifact commands", () => {
  it.each(["convex", "airtable", "google-sheets"] as const)("generates a non-destructive %s plan", (provider) => {
    const first = generateStoragePlan(provider, "seo-growth", "production", "2026-08-02T12:00:00.000Z", "schema");
    const second = generateStoragePlan(provider, "seo-growth", "production", "2026-08-02T12:00:00.000Z", "schema");
    expect(first).toEqual(second);
    expect(first.operations.every((operation) => operation.destructive === false)).toBe(true);
  });

  it("blocks verification when native evidence misses a resource", () => {
    const directory = mkdtempSync(join(tmpdir(), "loopstack-storage-"));
    const plan = generateStoragePlan("convex", "seo-growth", "production", "2026-08-02T12:00:00.000Z", "schema");
    const planPath = join(directory, "plan.json");
    const evidencePath = join(directory, "evidence.json");
    writeFileSync(planPath, JSON.stringify(plan));
    writeFileSync(evidencePath, JSON.stringify({
      provider: "convex",
      environment: "production",
      checkedAt: "2026-08-01T14:00:00.000Z",
      redacted: true,
      resources: [],
    }));
    const report = verifyStorageFiles(planPath, evidencePath);
    expect(report.status).toBe("blocked");
    expect(report.missingResources.length).toBeGreaterThan(0);
    expect(JSON.parse(readFileSync(planPath, "utf8")).loopId).toBe("seo-growth");
  });
});
