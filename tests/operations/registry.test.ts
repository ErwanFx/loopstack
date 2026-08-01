import { describe, expect, it } from "vitest";
import { buildLifecyclePlan, buildRegistry } from "../../src/operations/registry.js";
import { formatLoopList } from "../../src/commands/list.js";
import { findLoop } from "../../src/commands/show.js";

const definitions = [
  { id: "seo-growth", name: "SEO Growth", status: "active" as const, runtime: "hermes" as const, storage: "convex" as const, version: 3, targetMetric: "qualified_leads" },
  { id: "recruiting", name: "Recruiting", status: "building" as const, runtime: "claude-code" as const, storage: "airtable" as const, version: 1, targetMetric: "qualified_hires" },
  { id: "sponsorship", name: "Sponsorship", status: "archived" as const, runtime: "hermes" as const, storage: "google-sheets" as const, version: 2, targetMetric: "revenue" },
];

const runtime = [
  { loopId: "seo-growth", health: "healthy" as const, lastRunAt: "2026-08-01T10:00:00.000Z", openAlerts: 0, pendingApprovals: 0, latestGap: 20 },
  { loopId: "recruiting", health: "stale" as const, lastRunAt: "2026-07-30T10:00:00.000Z", openAlerts: 1, pendingApprovals: 1, latestGap: 4 },
  { loopId: "sponsorship", health: "degraded" as const, lastRunAt: "2026-07-01T10:00:00.000Z", openAlerts: 2, pendingApprovals: 0, latestGap: null },
  { loopId: "deleted-loop", health: "failed" as const, lastRunAt: null, openAlerts: 1, pendingApprovals: 0, latestGap: null },
];

describe("loop registry", () => {
  it("merges runtime health without overwriting Git lifecycle", async () => {
    const registry = await buildRegistry(definitions, runtime);
    expect(registry.loops.find((loop) => loop.id === "sponsorship")).toMatchObject({ status: "archived", health: "degraded" });
    expect(registry.loops.find((loop) => loop.id === "recruiting")).toMatchObject({ status: "building", health: "stale" });
  });

  it("marks runtime-only loops unregistered", async () => {
    const registry = await buildRegistry(definitions, runtime);
    expect(registry.loops.find((loop) => loop.id === "deleted-loop")).toMatchObject({ registration: "unregistered", health: "failed" });
  });

  it("generates lifecycle plans instead of mutating state", () => {
    const plan = buildLifecyclePlan("seo-growth", "pause", "production");
    expect(plan.requiresApproval).toBe(true);
    expect(plan.operations).toEqual([{ action: "pause", loopId: "seo-growth", environment: "production" }]);
  });

  it("formats list and show views from the same registry", async () => {
    const registry = await buildRegistry(definitions, runtime);
    expect(formatLoopList(registry)).toContain("seo-growth\tactive\thealthy");
    expect(findLoop(registry, "seo-growth")?.version).toBe(3);
  });
});
