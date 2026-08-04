import { readFileSync } from "node:fs";
import { parse } from "yaml";
import { describe, expect, it } from "vitest";

import { LoopDefinitionSchema } from "../../src/domain/schemas.js";
import { buildRegistry } from "../../src/operations/registry.js";
import { InMemoryQaTrustRegistry, runQa, type QaTrustRecord } from "../../src/qa/runner.js";
import { ClaudeCodeRuntimeAdapter } from "../../src/runtimes/claude-code.js";
import { CodexRuntimeAdapter } from "../../src/runtimes/codex.js";
import { HermesRuntimeAdapter } from "../../src/runtimes/hermes.js";
import { normalizeRuntimePackage } from "../../src/runtimes/normalize.js";
import { createStorageBlueprint } from "../../src/storage/blueprints.js";
import { approveProvisioningPlan, authorizeProvisioning, createProvisioningPlan, hashProvisioningApproval, verifyProvisioningEvidence } from "../../src/storage/provisioning.js";
import { executeSeoShadow } from "../../src/e2e/seo-shadow.js";

const root = "tests/fixtures/business-loops/loops/seo-growth";

describe("SEO loop shadow lifecycle", () => {
  it("validates, packages, records, measures, and monitors without external effects", async () => {
    const loop = LoopDefinitionSchema.parse(parse(readFileSync(`${root}/loop.yaml`, "utf8")));
    const hermes = await new HermesRuntimeAdapter().render({ loop });
    const claude = await new ClaudeCodeRuntimeAdapter().render({ loop });
    const codex = await new CodexRuntimeAdapter().render({ loop });
    expect(normalizeRuntimePackage(hermes)).toEqual(normalizeRuntimePackage(claude));
    expect(normalizeRuntimePackage(hermes)).toEqual(normalizeRuntimePackage(codex));
    expect(loop.schemaVersion).toBe(3);
    expect(loop.triggers.every((trigger) => trigger.enabled === false)).toBe(true);

    const plan = createProvisioningPlan(createStorageBlueprint("convex", loop.id), "shadow", "2026-08-02T12:00:00.000Z", "schema");
    const approval = approveProvisioningPlan(plan, "erwan", "2026-08-01T12:00:00.000Z");
    const trust = { trustedApprovalHashes: [hashProvisioningApproval(approval)], trustedApprovers: ["erwan"] };
    expect(authorizeProvisioning(plan, approval, "2026-08-01T13:00:00.000Z", trust).instructions.length).toBe(plan.operations.length);
    expect(verifyProvisioningEvidence(plan, {
      provider: "convex", environment: "shadow", checkedAt: "2026-08-01T13:30:00.000Z", redacted: true,
      resources: plan.operations.map((operation) => operation.resource),
    }).status).toBe("verified");

    const run = executeSeoShadow();
    expect(run.records.map((record) => record.type)).toEqual(expect.arrayContaining(["observation", "decision", "action-result", "evaluation", "learning"]));
    expect(run.followUps).toEqual([7, 14, 30]);
    expect(run.externalCalls).toBe(0);
    expect(run.action).toBe("simulate_draft");

    const gates = ["static", "connections", "storage-contract", "scenarios", "approvals", "idempotency", "alerts", "canary"] as const;
    const scopeHash = "a".repeat(64);
    const artifactHash = "b".repeat(64);
    const evidenceIds = Object.fromEntries(gates.map((gate) => [gate, `opaque-${gate}`]));
    const evidence = gates.map<QaTrustRecord>((gate) => ({
      evidenceId: `opaque-${gate}`, loopId: loop.id, scopeHash, artifactHash, gate, status: "pass",
      issuedAt: "2026-08-01T13:00:00.000Z", expiresAt: "2026-08-01T15:00:00.000Z", nonce: `nonce-${gate}`,
    }));
    const qa = await runQa({
      manifest: "valid", connections: "verified", storageContract: "verified", scenarios: "pass",
      approvals: "pass", idempotency: "pass", alerts: "pass", canary: "pass",
      loopId: loop.id, scopeHash, artifactHash, evidenceIds,
    }, new InMemoryQaTrustRegistry(evidence), new Date("2026-08-01T14:00:00.000Z"));
    expect(qa.verdict).toBe("pass");
    const registry = await buildRegistry([
      { id: loop.id, name: loop.name, status: "shadow", runtime: "hermes", storage: "convex", version: 1, targetMetric: "qualified_leads" },
    ], [{ loopId: loop.id, health: "healthy", lastRunAt: "2026-08-01T14:00:00.000Z", openAlerts: 0, pendingApprovals: 0, latestGap: 28 }]);
    expect(registry.loops[0]).toMatchObject({ status: "shadow", health: "healthy" });
  });

  it("alerts and requires reconciliation after an ambiguous timeout without duplicating action", () => {
    const run = executeSeoShadow("tool-timeout");
    expect(run.alert?.code).toBe("SIDE_EFFECT_UNKNOWN");
    expect(run.recovery).toEqual([{ id: "action-1", strategy: "reconcile-first" }]);
    expect(run.actionIds).toEqual(["action-1"]);
    expect(run.externalCalls).toBe(0);
  });
});
