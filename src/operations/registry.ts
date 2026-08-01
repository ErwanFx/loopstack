import type { LoopStatus } from "../domain/types.js";
import type { RuntimeName } from "../runtimes/types.js";
import type { StorageProvider } from "../storage/schema.js";

export type GitLoopDefinition = {
  id: string;
  name: string;
  status: LoopStatus;
  runtime: RuntimeName;
  storage: StorageProvider;
  version: number;
  targetMetric: string;
};

export type RuntimeLoopSummary = {
  loopId: string;
  health: "healthy" | "stale" | "degraded" | "failed" | "unknown";
  lastRunAt: string | null;
  openAlerts: number;
  pendingApprovals: number;
  latestGap: number | null;
};

export type OperationalLoopSummary = {
  id: string;
  name: string;
  status: LoopStatus;
  runtime: RuntimeName;
  storage: StorageProvider;
  version: number;
  health: RuntimeLoopSummary["health"];
  lastRunAt: string | null;
  openAlerts: number;
  pendingApprovals: number;
  targetMetric: string;
  latestGap: number | null;
  registration: "registered" | "unregistered";
};

export type LoopRegistry = { generatedAt: string | null; loops: OperationalLoopSummary[] };

export async function buildRegistry(
  definitions: readonly GitLoopDefinition[],
  runtimeRecords: readonly RuntimeLoopSummary[],
): Promise<LoopRegistry> {
  const runtimeById = new Map(runtimeRecords.map((record) => [record.loopId, record]));
  const loops: OperationalLoopSummary[] = definitions.map((definition) => {
    const runtime = runtimeById.get(definition.id);
    runtimeById.delete(definition.id);
    return {
      ...definition,
      health: runtime?.health ?? "unknown",
      lastRunAt: runtime?.lastRunAt ?? null,
      openAlerts: runtime?.openAlerts ?? 0,
      pendingApprovals: runtime?.pendingApprovals ?? 0,
      latestGap: runtime?.latestGap ?? null,
      registration: "registered",
    };
  });
  for (const runtime of runtimeById.values()) {
    loops.push({
      id: runtime.loopId,
      name: runtime.loopId,
      status: "inactive",
      runtime: "hermes",
      storage: "convex",
      version: 0,
      health: runtime.health,
      lastRunAt: runtime.lastRunAt,
      openAlerts: runtime.openAlerts,
      pendingApprovals: runtime.pendingApprovals,
      targetMetric: "unknown",
      latestGap: runtime.latestGap,
      registration: "unregistered",
    });
  }
  return { generatedAt: null, loops: loops.sort((left, right) => left.id.localeCompare(right.id)) };
}

export function buildLifecyclePlan(loopId: string, action: "pause" | "resume" | "archive", environment: string) {
  return { requiresApproval: true as const, operations: [{ action, loopId, environment }] };
}
