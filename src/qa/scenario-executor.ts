import { z } from "zod";

const ScenarioSchema = z.object({
  scenario: z.enum([
    "nominal", "missing-data", "low-confidence", "rejected-approval", "duplicate-webhook",
    "tool-timeout", "budget-exhausted", "agent-interrupted",
  ]),
  inject: z.string().min(1),
});

export type ScenarioResult = {
  terminal: "pass" | "blocked" | "approval-required" | "stopped" | "deduplicated" | "alerted" | "resumable";
  alertCode: string | null;
  actionIds: string[];
  actionState: "none" | "simulated" | "unknown";
  autoRetry: boolean;
  reconciliationRequired: boolean;
};

const outcomes: Record<z.infer<typeof ScenarioSchema>["scenario"], Omit<ScenarioResult, "actionIds">> = {
  nominal: { terminal: "pass", alertCode: null, actionState: "simulated", autoRetry: false, reconciliationRequired: false },
  "missing-data": { terminal: "blocked", alertCode: "MISSING_DATA", actionState: "none", autoRetry: false, reconciliationRequired: false },
  "low-confidence": { terminal: "approval-required", alertCode: "LOW_CONFIDENCE", actionState: "none", autoRetry: false, reconciliationRequired: false },
  "rejected-approval": { terminal: "stopped", alertCode: "APPROVAL_REJECTED", actionState: "none", autoRetry: false, reconciliationRequired: false },
  "duplicate-webhook": { terminal: "deduplicated", alertCode: "DUPLICATE_IGNORED", actionState: "simulated", autoRetry: false, reconciliationRequired: false },
  "tool-timeout": { terminal: "alerted", alertCode: "SIDE_EFFECT_UNKNOWN", actionState: "unknown", autoRetry: false, reconciliationRequired: true },
  "budget-exhausted": { terminal: "stopped", alertCode: "BUDGET_EXHAUSTED", actionState: "none", autoRetry: false, reconciliationRequired: false },
  "agent-interrupted": { terminal: "resumable", alertCode: "STALE_HEARTBEAT", actionState: "none", autoRetry: false, reconciliationRequired: false },
};

export function executeQaScenario(input: unknown): ScenarioResult {
  const fixture = ScenarioSchema.parse(input);
  const outcome = outcomes[fixture.scenario];
  return {
    ...outcome,
    actionIds: ["nominal", "duplicate-webhook", "tool-timeout"].includes(fixture.scenario) ? ["action-1"] : [],
  };
}
