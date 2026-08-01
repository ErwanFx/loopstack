import { buildRecoveryPlan } from "../operations/recovery.js";

type ShadowRecord = {
  type: "observation" | "decision" | "action-result" | "evaluation" | "learning";
  loopId: "seo-growth";
  runId: "shadow-run-1";
  eventId: string;
  idempotencyKey: string;
  payload: Record<string, unknown>;
};

export function executeSeoShadow(injection: "none" | "tool-timeout" = "none") {
  const timedOut = injection === "tool-timeout";
  const records: ShadowRecord[] = [
    { type: "observation", loopId: "seo-growth", runId: "shadow-run-1", eventId: "event-1", idempotencyKey: "shadow-1-observe", payload: { keywords: ["ai loops"] } },
    { type: "decision", loopId: "seo-growth", runId: "shadow-run-1", eventId: "event-2", idempotencyKey: "shadow-1-decide", payload: { selectedKeyword: "ai loops", evidence: "fake-openseo" } },
    { type: "action-result", loopId: "seo-growth", runId: "shadow-run-1", eventId: "event-3", idempotencyKey: "shadow-1-action", payload: { action: "simulate_draft", state: timedOut ? "unknown" : "simulated" } },
    { type: "evaluation", loopId: "seo-growth", runId: "shadow-run-1", eventId: "event-4", idempotencyKey: "shadow-1-evaluate", payload: { draftQuality: 0.84, businessMetric: "qualified_leads" } },
    { type: "learning", loopId: "seo-growth", runId: "shadow-run-1", eventId: "event-5", idempotencyKey: "shadow-1-learn", payload: { proposal: "test evidence-first outline" } },
  ];
  return {
    records,
    followUps: [7, 14, 30],
    action: "simulate_draft" as const,
    actionIds: ["action-1"],
    externalCalls: 0,
    alert: timedOut ? { code: "SIDE_EFFECT_UNKNOWN" as const } : null,
    recovery: timedOut
      ? buildRecoveryPlan([{ id: "action-1", idempotent: true, state: "unknown" }])
      : [],
  };
}
