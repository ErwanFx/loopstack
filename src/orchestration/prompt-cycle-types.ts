export type AgentRole = "maker" | "checker";
export type CycleDecision =
  | "continue"
  | "wait-human"
  | "wait-external"
  | "stop-success"
  | "stop-failure"
  | "escalate";

export type PromptCycleReasonCode =
  | "MAX_ITERATIONS"
  | "MAX_COST"
  | "DEADLINE"
  | "NO_PROGRESS"
  | "SIDE_EFFECT_UNKNOWN"
  | "ACTION_POLICY_VIOLATION"
  | "INVALID_AGENT_RESULT"
  | "CHECKPOINT_MISMATCH";

export interface PromptCycleLimits {
  maxIterations: number;
  maxCost: number;
  deadline: string;
  maxConsecutiveNoProgress: number;
}

export interface AgentRunRequest {
  requestId: string;
  loopId: string;
  runId: string;
  iteration: number;
  role: AgentRole;
  promptTemplateVersion: number;
  inputSnapshotHash: string;
  target: string;
  workItemId: string;
  currentState: string;
  observations: readonly string[];
  previousEvaluation: string | null;
  allowedActions: readonly string[];
  forbiddenActions: readonly string[];
  skills: readonly string[];
  limits: Readonly<PromptCycleLimits>;
  rubric?: readonly string[];
  makerResultId?: string;
}

export type ActionAttempt =
  | { action: string; sideEffectState: "none" | "unknown" }
  | { action: string; sideEffectState: "confirmed"; requestId: string; effectEvidenceId: string; idempotencyKey: string };

export interface EffectTrustEnvelope {
  requestId: string; loopId: string; runId: string; workItemId: string; role: AgentRole;
  action: string; target: string; idempotencyKey: string;
}
export interface EffectAuthorityExpectedEnvelope {
  requestId: string;
  effects: readonly { evidenceId: string; envelope: EffectTrustEnvelope }[];
}

export interface VerifiedEffect {
  verificationId: string;
  evidenceId: string;
  envelope: EffectTrustEnvelope;
  verifiedAt: string;
}

export interface AgentRunResult {
  requestId: string;
  role: AgentRole;
  resultId: string;
  outputArtifactRefs: string[];
  actionAttempts: ActionAttempt[];
  observations: string[];
  tokenUsage: number;
  cost: number;
  progressFingerprint: string;
  /** Host-owned durable reconciliation proof. Fresh invoker results carrying this field are rejected. */
  verifiedEffects?: readonly VerifiedEffect[];
}

export interface PromptEffectAuthority {
  loadRecordedResult(requestId: string): Promise<AgentRunResult | null>;
  verifyConsumeAndPersistResult(
    expectedEnvelope: EffectAuthorityExpectedEnvelope,
    result: AgentRunResult,
    hostNow: string,
  ): Promise<AgentRunResult | null>;
}

export interface CycleEvaluation {
  decision: CycleDecision;
  reason: string;
  evaluationId: string;
  nextAllowedActions?: string[];
  nextInputSnapshotHash?: string;
  nextObservations?: string[];
  nextCurrentState?: string;
}

export interface EvaluationInput {
  request: AgentRunRequest;
  makerResult: AgentRunResult;
  checkerResult: AgentRunResult | null;
  accumulatedCost: number;
  consecutiveNoProgress: number;
}

export interface AgentInvoker {
  invoke(request: AgentRunRequest): Promise<AgentRunResult>;
}

export interface PromptCycleStore {
  loadCheckpoint(loopId: string, workItemId: string): Promise<PromptCycleCheckpoint | null>;
  loadResult(requestId: string): Promise<AgentRunResult | null>;
  saveCheckpoint(checkpoint: PromptCycleCheckpoint): Promise<void>;
  appendResult(result: AgentRunResult): Promise<void>;
}

export interface CycleEvaluator {
  evaluate(input: EvaluationInput): Promise<CycleEvaluation>;
}

export type CheckpointPhase =
  | "before-invoke"
  | "after-maker"
  | "before-checker"
  | "after-checker"
  | "after-evaluate"
  | "terminal";

export interface PromptCycleCheckpoint {
  checkpointRevision: number;
  runContractHash: string;
  loopId: string;
  workItemId: string;
  baseRunId: string;
  runId: string;
  target: string;
  promptTemplateVersions: Readonly<{ maker: number; checker: number }>;
  limits: Readonly<PromptCycleLimits>;
  initialInputSnapshotHash: string;
  resumeCount: number;
  iteration: number;
  phase: CheckpointPhase;
  invocationRole?: AgentRole;
  status: "running" | "waiting" | "completed" | "failed" | "escalated";
  accumulatedCost: number;
  consecutiveNoProgress: number;
  lastProgressFingerprint: string | null;
  previousEvaluation: string | null;
  decision: CycleDecision | null;
  allowedActions: readonly string[];
  inputSnapshotHash?: string;
  observations?: readonly string[];
  currentState?: string;
  makerResult?: AgentRunResult;
  checkerResult?: AgentRunResult;
  evaluationReason?: string;
  reasonCode?: PromptCycleReasonCode;
  updatedAt: string;
}

export interface PromptCycleInput {
  loopId: string;
  workItemId: string;
  runId: string;
  target: string;
  currentState: string;
  inputSnapshotHash: string;
  observations: string[];
  allowedActions: string[];
  forbiddenActions: string[];
  skills: string[];
  promptTemplateVersions: { maker: number; checker: number };
  checker: { enabled: boolean; rubric: string[] };
  limits: PromptCycleLimits;
  resumeCapabilityId?: string;
}

export interface PromptCycleResumeCapability {
  id: string;
  waitDecision: "wait-human" | "wait-external";
  loopId: string;
  workItemId: string;
  runId: string;
  previousEvaluation: string;
  checkpointRevision: number;
  oldSnapshotHash: string;
  newSnapshotHash: string;
  runContractHash: string;
  issuedAt: string;
  expiresAt: string;
}

export interface PromptCycleResumeCapabilityResolver {
  consume(id: string, expectedEnvelope: Omit<PromptCycleResumeCapability, "id" | "issuedAt" | "expiresAt">, hostNow: string): Promise<PromptCycleResumeCapability | null>;
}

export interface PromptCycleDependencies {
  invoker: AgentInvoker;
  store: PromptCycleStore;
  evaluator: CycleEvaluator;
  now?: () => Date;
  resumeCapabilities?: PromptCycleResumeCapabilityResolver;
  effectAuthority?: PromptEffectAuthority;
}

export interface PromptCycleOutcome {
  decision: Exclude<CycleDecision, "continue">;
  reason: string;
  reasonCode?: PromptCycleReasonCode;
  evaluationId?: string;
  runId: string;
  iteration: number;
  accumulatedCost: number;
}

