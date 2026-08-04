import { z } from "zod";

const ScenarioSchema = z.object({
  scenario: z.enum([
    "nominal", "missing-data", "low-confidence", "rejected-approval", "duplicate-webhook",
    "tool-timeout", "budget-exhausted", "agent-interrupted",
    "delayed-external-response", "human-approval-timeout", "invalid-state-transition",
    "revision-conflict", "stale-work-item", "partial-documents", "external-submission-rejected",
    "learning-evidence-insufficient", "readonly-plugin-target", "max-iterations", "no-progress",
    "checker-rejected", "controller-resume",
  ]),
  inject: z.string().min(1),
});

export type ScenarioResult = {
  terminal: "pass" | "blocked" | "approval-required" | "stopped" | "deduplicated" | "alerted" | "resumable" | "waiting";
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
  "delayed-external-response": { terminal: "waiting", alertCode: "EXTERNAL_RESPONSE_DELAYED", actionState: "none", autoRetry: false, reconciliationRequired: false },
  "human-approval-timeout": { terminal: "alerted", alertCode: "HUMAN_APPROVAL_TIMEOUT", actionState: "none", autoRetry: false, reconciliationRequired: false },
  "invalid-state-transition": { terminal: "blocked", alertCode: "INVALID_STATE_TRANSITION", actionState: "none", autoRetry: false, reconciliationRequired: false },
  "revision-conflict": { terminal: "blocked", alertCode: "REVISION_CONFLICT", actionState: "none", autoRetry: false, reconciliationRequired: false },
  "stale-work-item": { terminal: "blocked", alertCode: "STALE_WORK_ITEM", actionState: "none", autoRetry: false, reconciliationRequired: false },
  "partial-documents": { terminal: "blocked", alertCode: "PARTIAL_DOCUMENT_SET", actionState: "none", autoRetry: false, reconciliationRequired: false },
  "external-submission-rejected": { terminal: "stopped", alertCode: "EXTERNAL_SUBMISSION_REJECTED", actionState: "simulated", autoRetry: false, reconciliationRequired: false },
  "learning-evidence-insufficient": { terminal: "blocked", alertCode: "LEARNING_EVIDENCE_INSUFFICIENT", actionState: "none", autoRetry: false, reconciliationRequired: false },
  "readonly-plugin-target": { terminal: "blocked", alertCode: "READONLY_PLUGIN_TARGET", actionState: "none", autoRetry: false, reconciliationRequired: false },
  "max-iterations": { terminal: "stopped", alertCode: "MAX_ITERATIONS", actionState: "none", autoRetry: false, reconciliationRequired: false },
  "no-progress": { terminal: "stopped", alertCode: "NO_PROGRESS", actionState: "none", autoRetry: false, reconciliationRequired: false },
  "checker-rejected": { terminal: "resumable", alertCode: "CHECKER_REJECTED", actionState: "none", autoRetry: false, reconciliationRequired: false },
  "controller-resume": { terminal: "resumable", alertCode: "CONTROLLER_RESUME", actionState: "none", autoRetry: false, reconciliationRequired: false },
};

export function executeQaScenario(input: unknown): ScenarioResult {
  const fixture = ScenarioSchema.parse(input);
  const outcome = outcomes[fixture.scenario];
  return {
    ...outcome,
    actionIds: ["nominal", "duplicate-webhook", "tool-timeout"].includes(fixture.scenario) ? ["action-1"] : [],
  };
}
