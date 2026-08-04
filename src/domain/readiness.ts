export type ConnectionState = "connected" | "tested" | "untested" | "missing";

export type ReadinessCandidate = {
  contractVersion?: 3;
  recurringOpportunity?: boolean;
  target?: { metric?: string; desired?: number };
  currentState?: { value?: number; observedAt?: string };
  gap?: { value?: number };
  actionSpace?: string[];
  feedback?: Array<{ metric?: string; delayDays?: number }>;
  measurementHorizonDays?: number;
  dataAccess?: "verified" | "partial" | "missing";
  owner?: string;
  approvalPolicy?: { mode?: "always" | "conditional" | "never"; requiredFor?: string[] };
  budget?: { maxCostPerRun?: number; maxIterations?: number };
  stopConditions?: string[];
  escalationConditions?: string[];
  idempotencyStrategy?: string;
  storageConnection?: ConnectionState;
  toolConnections?: Array<{ name?: string; status?: ConnectionState }>;
  alertConnection?: ConnectionState;
  runSuccessCriteria?: string[];
  businessSuccessCriteria?: string[];
  primaryTriggers?: Array<{ idempotencyKey?: string }>;
  consequentialActions?: string[];
  humanGates?: Array<{
    beforeAction?: string;
    choices?: string[];
    timeoutHours?: number;
    onTimeout?: "escalate" | "reject" | "pause";
  }>;
  guardrailActions?: Array<"pause" | "stop" | "escalate">;
  evidenceQuality?: number;
  leverage?: number;
  reversibility?: number;
  dataCompleteness?: number;
  measurementSpeed?: number;
};

export type ReadinessReport = {
  status: "ready" | "blocked";
  score: number;
  blocking: string[];
  advisory: string[];
};

type Requirement = readonly [code: string, satisfied: (candidate: ReadinessCandidate) => boolean];

const nonEmpty = (values: string[] | undefined): boolean => Boolean(values?.some((value) => value.trim()));
const hasText = (value: string | undefined): boolean => Boolean(value?.trim());

const requirements: readonly Requirement[] = [
  ["recurring_opportunity", (candidate) => candidate.recurringOpportunity === true],
  ["measurable_target", (candidate) => hasText(candidate.target?.metric) && Number.isFinite(candidate.target?.desired)],
  ["observable_current_state", (candidate) => Number.isFinite(candidate.currentState?.value) && !Number.isNaN(Date.parse(candidate.currentState?.observedAt ?? ""))],
  ["assessable_gap", (candidate) => Number.isFinite(candidate.gap?.value)],
  ["bounded_action_space", (candidate) => nonEmpty(candidate.actionSpace)],
  ["feedback_signal", (candidate) => Boolean(candidate.feedback?.some((signal) => hasText(signal.metric) && Number.isFinite(signal.delayDays)))],
  ["measurement_horizon", (candidate) => Number.isInteger(candidate.measurementHorizonDays) && (candidate.measurementHorizonDays ?? 0) > 0],
  ["data_access", (candidate) => candidate.dataAccess === "verified"],
  ["named_owner", (candidate) => hasText(candidate.owner)],
  ["approval_policy", (candidate) => Boolean(candidate.approvalPolicy?.mode)],
  ["budget_and_iteration_limits", (candidate) => (candidate.budget?.maxCostPerRun ?? 0) > 0 && Number.isInteger(candidate.budget?.maxIterations) && (candidate.budget?.maxIterations ?? 0) > 0],
  ["stop_and_escalation", (candidate) => nonEmpty(candidate.stopConditions) && nonEmpty(candidate.escalationConditions)],
  ["idempotency_strategy", (candidate) => hasText(candidate.idempotencyStrategy)],
  ["connected_storage", (candidate) => candidate.storageConnection === "connected" || candidate.storageConnection === "tested"],
  ["required_tool_connections", (candidate) => Boolean(candidate.toolConnections?.length) && candidate.toolConnections!.every((connection) => hasText(connection.name) && (connection.status === "connected" || connection.status === "tested"))],
  ["tested_alert_channel", (candidate) => candidate.alertConnection === "tested"],
  ["run_success_criteria", (candidate) => nonEmpty(candidate.runSuccessCriteria)],
  ["business_success_criteria", (candidate) => nonEmpty(candidate.businessSuccessCriteria)],
  ["primary_trigger_policy", (candidate) => candidate.contractVersion !== 3
    || Boolean(candidate.primaryTriggers?.length
      && candidate.primaryTriggers.every((trigger) => hasText(trigger.idempotencyKey)))],
  ["consequential_human_gates", (candidate) => candidate.contractVersion !== 3
    || (candidate.consequentialActions ?? []).every((action) => candidate.humanGates?.some((gate) =>
      gate.beforeAction === action
      && gate.choices?.includes("approve")
      && (gate.timeoutHours ?? 0) > 0
      && Boolean(gate.onTimeout)))],
  ["guardrail_response", (candidate) => candidate.contractVersion !== 3 || nonEmpty(candidate.guardrailActions)],
] as const;

const advisoryFactors = ["evidenceQuality", "leverage", "reversibility", "dataCompleteness", "measurementSpeed"] as const;

export function evaluateReadiness(candidate: ReadinessCandidate): ReadinessReport {
  const blocking = requirements.filter(([, satisfied]) => !satisfied(candidate)).map(([code]) => code);
  const normalizedFactors = advisoryFactors.map((factor) => Math.min(1, Math.max(0, candidate[factor] ?? 0)));
  const score = Math.round((normalizedFactors.reduce((sum, value) => sum + value, 0) / normalizedFactors.length) * 100);
  const advisory = advisoryFactors
    .filter((factor) => (candidate[factor] ?? 0) < 0.6)
    .map((factor) => `improve_${factor.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`)}`);

  return { status: blocking.length === 0 ? "ready" : "blocked", score, blocking, advisory };
}
