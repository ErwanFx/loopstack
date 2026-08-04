import { createHash } from "node:crypto";
import type {
  AgentRole,
  AgentRunRequest,
  AgentRunResult,
  CycleDecision,
  CycleEvaluation,
  PromptCycleCheckpoint,
  PromptCycleDependencies,
  PromptCycleInput,
  PromptCycleOutcome,
  PromptCycleReasonCode,
} from "./prompt-cycle-types.js";

function validateInput(input: PromptCycleInput): void {
  if (!/^[a-f0-9]{64}$/.test(input.inputSnapshotHash)) {
    throw new Error("inputSnapshotHash must be a lowercase SHA-256 hash");
  }
  if (!Number.isInteger(input.limits.maxIterations) || input.limits.maxIterations <= 0) {
    throw new Error("maxIterations must be a positive integer");
  }
  if (!Number.isFinite(input.limits.maxCost) || input.limits.maxCost <= 0) {
    throw new Error("maxCost must be positive");
  }
  if (!Number.isInteger(input.limits.maxConsecutiveNoProgress)
    || input.limits.maxConsecutiveNoProgress <= 0) {
    throw new Error("maxConsecutiveNoProgress must be a positive integer");
  }
  if (Number.isNaN(Date.parse(input.limits.deadline))) {
    throw new Error("deadline must be an ISO timestamp");
  }
}

export function promptCycleRunContractHash(input: PromptCycleInput): string {
  return createHash("sha256").update(JSON.stringify({
    target: input.target,
    initialInputSnapshotHash: input.inputSnapshotHash,
    allowedActions: [...input.allowedActions],
    actionCeiling: [...input.allowedActions],
    forbiddenActions: [...input.forbiddenActions],
    skills: [...input.skills],
    checker: { enabled: input.checker.enabled, rubric: [...input.checker.rubric] },
    promptTemplateVersions: input.promptTemplateVersions,
    limits: input.limits,
  })).digest("hex");
}

function sameJson(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function hasUnknownSideEffect(result: AgentRunResult): boolean {
  return result.actionAttempts.some((attempt) => attempt.sideEffectState === "unknown");
}

async function resolveConfirmedEffects(
  request: AgentRunRequest,
  result: AgentRunResult,
  dependencies: PromptCycleDependencies,
  hostNow: string,
): Promise<AgentRunResult | null> {
  const effects = result.actionAttempts.flatMap((attempt) => {
    if (attempt.sideEffectState !== "confirmed") return [];
    const envelope = {
      requestId: request.requestId, loopId: request.loopId, runId: request.runId,
      workItemId: request.workItemId, role: request.role, action: attempt.action,
      target: request.target, idempotencyKey: attempt.idempotencyKey,
    };
    return [{ evidenceId: attempt.effectEvidenceId, envelope }];
  });
  if (effects.length === 0) return result;
  if (dependencies.effectAuthority === undefined) return null;
  const canonical = await dependencies.effectAuthority.verifyConsumeAndPersistResult(
    { requestId: request.requestId, effects }, result, hostNow,
  );
  if (canonical === null) return null;
  const { verifiedEffects: _proofs, ...canonicalAgentResult } = canonical;
  if (!sameJson(canonicalAgentResult, result) || invalidResultReason(request, canonical, true) !== null
    || !persistedEffectsAreValid(request, canonical)) return null;
  return canonical;
}

function invalidResultReason(request: AgentRunRequest, candidate: unknown, persisted = false): string | null {
  if (candidate === null || typeof candidate !== "object") return "Agent returned an invalid structured result";
  const result = candidate as Partial<AgentRunResult>;
  if ((!persisted && Object.hasOwn(result, "verifiedEffects"))
    || result.requestId !== request.requestId || result.role !== request.role) {
    return "Agent result identity does not match its request";
  }
  if (typeof result.resultId !== "string" || result.resultId.length === 0
    || !Number.isFinite(result.cost) || (result.cost ?? -1) < 0
    || !Number.isInteger(result.tokenUsage) || (result.tokenUsage ?? -1) < 0
    || typeof result.progressFingerprint !== "string" || result.progressFingerprint.length === 0
    || !Array.isArray(result.observations) || result.observations.some((value) => typeof value !== "string")
    || !Array.isArray(result.outputArtifactRefs)
    || result.outputArtifactRefs.some((value) => typeof value !== "string" || value.length === 0)
    || !Array.isArray(result.actionAttempts)
    || result.actionAttempts.some((attempt) => attempt === null || typeof attempt !== "object"
      || typeof attempt.action !== "string" || attempt.action.length === 0
      || !["none", "confirmed", "unknown"].includes(attempt.sideEffectState)
      || (attempt.sideEffectState === "confirmed" && (
        attempt.requestId !== request.requestId
        || typeof attempt.effectEvidenceId !== "string" || attempt.effectEvidenceId.length === 0
        || typeof attempt.idempotencyKey !== "string" || attempt.idempotencyKey.length === 0
      )))) {
    return "Agent returned an invalid structured result";
  }
  const allowed = new Set(request.allowedActions);
  const forbidden = new Set(request.forbiddenActions);
  if (result.actionAttempts.some(({ action }) => !allowed.has(action) || forbidden.has(action))) {
    return "Agent attempted an action outside the trusted policy ceiling";
  }
  return null;
}

function persistedEffectsAreValid(request: AgentRunRequest, result: AgentRunResult): boolean {
  const confirmed = result.actionAttempts.filter((attempt) => attempt.sideEffectState === "confirmed");
  const verified = result.verifiedEffects ?? [];
  if (confirmed.length !== verified.length) return false;
  return confirmed.every((attempt, index) => {
    const proof = verified[index];
    if (proof === undefined || typeof proof.verificationId !== "string" || proof.verificationId.length === 0
      || proof.evidenceId !== attempt.effectEvidenceId || !Number.isFinite(Date.parse(proof.verifiedAt))) return false;
    return sameJson(proof.envelope, {
      requestId: request.requestId, loopId: request.loopId, runId: request.runId,
      workItemId: request.workItemId, role: request.role, action: attempt.action,
      target: request.target, idempotencyKey: attempt.idempotencyKey,
    });
  });
}

function invalidEvaluationReason(candidate: unknown): string | null {
  if (candidate === null || typeof candidate !== "object") return "Evaluator returned an invalid structured result";
  const evaluation = candidate as Partial<CycleEvaluation>;
  if (!["continue", "wait-human", "wait-external", "stop-success", "stop-failure", "escalate"].includes(evaluation.decision as string)
    || typeof evaluation.reason !== "string" || evaluation.reason.length === 0
    || typeof evaluation.evaluationId !== "string" || evaluation.evaluationId.length === 0
    || (evaluation.nextAllowedActions !== undefined && (!Array.isArray(evaluation.nextAllowedActions)
      || evaluation.nextAllowedActions.some((action) => typeof action !== "string" || action.length === 0)))
    || (evaluation.nextObservations !== undefined && (!Array.isArray(evaluation.nextObservations)
      || evaluation.nextObservations.some((observation) => typeof observation !== "string")))
    || (evaluation.nextCurrentState !== undefined && (typeof evaluation.nextCurrentState !== "string" || evaluation.nextCurrentState.length === 0))) {
    return "Evaluator returned an invalid structured result";
  }
  return null;
}

function runIdForResume(baseRunId: string, resumeCount: number): string {
  return resumeCount === 0 ? baseRunId : `${baseRunId}-resume-${resumeCount}`;
}

function statusFor(decision: Exclude<CycleDecision, "continue">): PromptCycleCheckpoint["status"] {
  if (decision === "wait-human" || decision === "wait-external") return "waiting";
  if (decision === "stop-success") return "completed";
  if (decision === "stop-failure") return "failed";
  return "escalated";
}

function immutableRequest(input: {
  cycle: PromptCycleInput;
  runId: string;
  iteration: number;
  role: AgentRole;
  snapshotHash: string;
  currentState: string;
  observations: readonly string[];
  previousEvaluation: string | null;
  allowedActions: readonly string[];
  makerResultId?: string;
}): AgentRunRequest {
  const request: AgentRunRequest = {
    requestId: `${input.runId}:${input.iteration}:${input.role}`,
    loopId: input.cycle.loopId,
    runId: input.runId,
    iteration: input.iteration,
    role: input.role,
    promptTemplateVersion: input.cycle.promptTemplateVersions[input.role],
    inputSnapshotHash: input.snapshotHash,
    target: input.cycle.target,
    workItemId: input.cycle.workItemId,
    currentState: input.currentState,
    observations: Object.freeze([...input.observations]),
    previousEvaluation: input.previousEvaluation,
    allowedActions: Object.freeze([...input.allowedActions]),
    forbiddenActions: Object.freeze([...input.cycle.forbiddenActions]),
    skills: Object.freeze([...input.cycle.skills]),
    limits: Object.freeze({ ...input.cycle.limits }),
    ...(input.role === "checker" ? { rubric: Object.freeze([...input.cycle.checker.rubric]) } : {}),
    ...(input.makerResultId === undefined ? {} : { makerResultId: input.makerResultId }),
  };
  return Object.freeze(request);
}

export async function runPromptCycle(
  input: PromptCycleInput,
  dependencies: PromptCycleDependencies,
): Promise<PromptCycleOutcome> {
  validateInput(input);
  const now = dependencies.now ?? (() => new Date());
  const existing = await dependencies.store.loadCheckpoint(input.loopId, input.workItemId);
  const runContractHash = promptCycleRunContractHash({
    ...input,
    inputSnapshotHash: existing?.initialInputSnapshotHash ?? input.inputSnapshotHash,
  });
  const immutableMismatch = existing !== null && (
    existing.runContractHash !== runContractHash
    || existing.loopId !== input.loopId
    || existing.workItemId !== input.workItemId
    || existing.baseRunId !== input.runId
    || existing.target !== input.target
    || !sameJson(existing.promptTemplateVersions, input.promptTemplateVersions)
    || !sameJson(existing.limits, input.limits)
  );
  const waitingCheckpoint = existing !== null
    && existing.status === "waiting"
    && (existing.decision === "wait-human" || existing.decision === "wait-external");
  const capabilityId = input.resumeCapabilityId;
  const resumeExpected = waitingCheckpoint && existing !== null ? {
    waitDecision: existing.decision as "wait-human" | "wait-external",
    loopId: existing.loopId,
    workItemId: existing.workItemId,
    runId: existing.runId,
    previousEvaluation: existing.previousEvaluation!,
    checkpointRevision: existing.checkpointRevision,
    oldSnapshotHash: existing.inputSnapshotHash!,
    newSnapshotHash: input.inputSnapshotHash,
    runContractHash: existing.runContractHash,
  } : null;
  const signal = !waitingCheckpoint || immutableMismatch || capabilityId === undefined || resumeExpected === null
    ? null
    : await dependencies.resumeCapabilities?.consume(capabilityId, resumeExpected, now().toISOString()) ?? null;
  const signalIssuedAt = signal === null ? Number.NaN : Date.parse(signal.issuedAt);
  const signalExpiresAt = signal === null ? Number.NaN : Date.parse(signal.expiresAt);
  const resumeNow = now().getTime();
  const resumeFromWait = waitingCheckpoint
    && !immutableMismatch
    && signal !== null
    && signal.id === capabilityId
    && signal.waitDecision === existing.decision
    && signal.loopId === existing.loopId
    && signal.workItemId === existing.workItemId
    && signal.runId === existing.runId
    && signal.previousEvaluation === existing.previousEvaluation
    && signal.checkpointRevision === existing.checkpointRevision
    && signal.oldSnapshotHash === existing.inputSnapshotHash
    && signal.newSnapshotHash === input.inputSnapshotHash
    && signal.runContractHash === existing.runContractHash
    && Number.isFinite(signalIssuedAt)
    && Number.isFinite(signalExpiresAt)
    && signalIssuedAt <= resumeNow
    && signalExpiresAt > resumeNow
    && input.inputSnapshotHash !== existing.inputSnapshotHash;

  if (existing !== null && (immutableMismatch
    || (!waitingCheckpoint && existing.initialInputSnapshotHash !== input.inputSnapshotHash)
    || (waitingCheckpoint && capabilityId !== undefined && !resumeFromWait))) {
    const reason = "Checkpoint or resume signal does not match the immutable prompt-cycle contract";
    const mismatched: PromptCycleCheckpoint = {
      ...existing,
      checkpointRevision: existing.checkpointRevision + 1,
      phase: "terminal",
      status: "escalated",
      decision: "escalate",
      reasonCode: "CHECKPOINT_MISMATCH",
      evaluationReason: reason,
      updatedAt: now().toISOString(),
    };
    await dependencies.store.saveCheckpoint(mismatched);
    return {
      decision: "escalate",
      reason,
      reasonCode: "CHECKPOINT_MISMATCH",
      runId: existing.runId,
      iteration: existing.iteration,
      accumulatedCost: existing.accumulatedCost,
    };
  }
  const startsNewRun = existing !== null && (resumeFromWait
    || (existing.phase === "after-evaluate" && existing.decision === "continue"));
  let resumeCount = existing === null ? 0 : existing.resumeCount + (startsNewRun ? 1 : 0);
  let runId = existing !== null && !startsNewRun ? existing.runId : runIdForResume(input.runId, resumeCount);
  let iteration = 1;
  let accumulatedCost = 0;
  let consecutiveNoProgress = 0;
  let lastProgressFingerprint: string | null = null;
  let previousEvaluation: string | null = null;
  let allowedActions: readonly string[] = [...input.allowedActions];
  let snapshotHash = input.inputSnapshotHash;
  let observations: readonly string[] = [...input.observations];
  let currentState = input.currentState;
  let checkpointRevision = existing?.checkpointRevision ?? -1;

  const checkpoint = async (
    fields: Partial<PromptCycleCheckpoint> & Pick<PromptCycleCheckpoint, "phase" | "status">,
  ): Promise<PromptCycleCheckpoint> => {
    const { phase, status, ...overrides } = fields;
    checkpointRevision += 1;
    const saved: PromptCycleCheckpoint = {
      checkpointRevision,
      loopId: input.loopId,
      workItemId: input.workItemId,
      baseRunId: input.runId,
      runId,
      target: input.target,
      promptTemplateVersions: { ...input.promptTemplateVersions },
      limits: { ...input.limits },
      runContractHash,
      initialInputSnapshotHash: existing?.initialInputSnapshotHash ?? input.inputSnapshotHash,
      resumeCount,
      iteration,
      phase,
      status,
      accumulatedCost,
      consecutiveNoProgress,
      lastProgressFingerprint,
      previousEvaluation,
      decision: null,
      allowedActions: [...allowedActions],
      inputSnapshotHash: snapshotHash,
      observations: [...observations],
      currentState,
      updatedAt: now().toISOString(),
      ...overrides,
    };
    await dependencies.store.saveCheckpoint(saved);
    return saved;
  };

  const terminate = async (
    decision: Exclude<CycleDecision, "continue">,
    reason: string,
    reasonCode?: PromptCycleReasonCode,
    evaluationId?: string,
  ): Promise<PromptCycleOutcome> => {
    await checkpoint({
      phase: "terminal",
      status: statusFor(decision),
      decision,
      previousEvaluation: evaluationId ?? previousEvaluation,
      evaluationReason: reason,
      ...(reasonCode === undefined ? {} : { reasonCode }),
    });
    return {
      decision,
      reason,
      ...(reasonCode === undefined ? {} : { reasonCode }),
      ...(evaluationId === undefined ? {} : { evaluationId }),
      runId,
      iteration,
      accumulatedCost,
    };
  };

  let recoveredMaker: AgentRunResult | null = null;
  if (existing !== null) {
    if (existing.status !== "running" && !resumeFromWait) {
      const terminalDecision = existing.decision;
      if (terminalDecision === null || terminalDecision === "continue") {
        throw new Error("Terminal checkpoint is missing a terminal decision");
      }
      return {
        decision: terminalDecision,
        reason: existing.evaluationReason ?? "Previously terminated",
        ...(existing.reasonCode === undefined ? {} : { reasonCode: existing.reasonCode }),
        ...(existing.previousEvaluation === null ? {} : { evaluationId: existing.previousEvaluation }),
        runId: existing.runId,
        iteration: existing.iteration,
        accumulatedCost: existing.accumulatedCost,
      };
    }
    iteration = resumeFromWait
      ? existing.iteration + 1
      : existing.phase === "after-evaluate" && existing.decision === "continue"
      ? existing.iteration + 1
      : existing.iteration;
    accumulatedCost = existing.accumulatedCost;
    consecutiveNoProgress = existing.consecutiveNoProgress;
    lastProgressFingerprint = existing.lastProgressFingerprint;
    previousEvaluation = existing.previousEvaluation;
    allowedActions = existing.allowedActions;
    snapshotHash = resumeFromWait ? input.inputSnapshotHash : existing.inputSnapshotHash ?? snapshotHash;
    observations = existing.observations ?? observations;
    currentState = existing.currentState ?? currentState;

    if (existing.phase === "before-invoke" && existing.invocationRole !== "checker") {
      const recoveryRequest = immutableRequest({
        cycle: input, runId: existing.runId, iteration: existing.iteration, role: "maker",
        snapshotHash, currentState, observations, previousEvaluation, allowedActions,
      });
      recoveredMaker = await dependencies.store.loadResult(recoveryRequest.requestId);
      if (recoveredMaker === null && dependencies.effectAuthority !== undefined) {
        recoveredMaker = await dependencies.effectAuthority.loadRecordedResult(recoveryRequest.requestId);
        if (recoveredMaker !== null) await dependencies.store.appendResult(recoveredMaker);
      }
      if (recoveredMaker === null) {
        return terminate("escalate", "An interrupted maker invocation may have an unreconciled side effect", "SIDE_EFFECT_UNKNOWN");
      }
      const invalidRecovered = invalidResultReason(recoveryRequest, recoveredMaker, true);
      if (invalidRecovered !== null || !persistedEffectsAreValid(recoveryRequest, recoveredMaker)) {
        return terminate("escalate", invalidRecovered ?? "Persisted maker effect proof is invalid", "INVALID_AGENT_RESULT");
      }
      accumulatedCost += recoveredMaker.cost;
      await checkpoint({ phase: "after-maker", status: "running", makerResult: recoveredMaker });
    }
  }

  let resumedMaker = recoveredMaker ?? (existing?.phase === "after-maker"
    || existing?.phase === "before-checker"
    || existing?.phase === "after-checker"
    ? existing.makerResult ?? null
    : null);
  let resumedChecker = existing?.phase === "after-checker" ? existing.checkerResult ?? null : null;

  if (existing?.phase === "before-checker") {
    if (resumedMaker === null) {
      return terminate("escalate", "Interrupted checker checkpoint is missing its maker result", "INVALID_AGENT_RESULT");
    }
    const checkerRequest = immutableRequest({
      cycle: input, runId: existing.runId, iteration: existing.iteration, role: "checker",
      snapshotHash, currentState, observations: [...observations, ...resumedMaker.observations],
      previousEvaluation, allowedActions: [], makerResultId: resumedMaker.resultId,
    });
    resumedChecker = await dependencies.store.loadResult(checkerRequest.requestId);
    if (resumedChecker === null && dependencies.effectAuthority !== undefined) {
      resumedChecker = await dependencies.effectAuthority.loadRecordedResult(checkerRequest.requestId);
      if (resumedChecker !== null) await dependencies.store.appendResult(resumedChecker);
    }
    if (resumedChecker === null) {
      return terminate("escalate", "An interrupted checker invocation may have an unreconciled side effect", "SIDE_EFFECT_UNKNOWN");
    }
    const invalidChecker = invalidResultReason(checkerRequest, resumedChecker, true);
    if (invalidChecker !== null || !persistedEffectsAreValid(checkerRequest, resumedChecker)) {
      return terminate("escalate", invalidChecker ?? "Persisted checker effect proof is invalid", "INVALID_AGENT_RESULT");
    }
    accumulatedCost += resumedChecker.cost;
    await checkpoint({ phase: "after-checker", status: "running", makerResult: resumedMaker, checkerResult: resumedChecker });
  }

  while (true) {
    if (iteration > input.limits.maxIterations) {
      return terminate("escalate", "Maximum iteration count reached", "MAX_ITERATIONS");
    }
    if (now().getTime() >= Date.parse(input.limits.deadline)) {
      return terminate("escalate", "Prompt-cycle deadline reached", "DEADLINE");
    }

    let makerRequest: AgentRunRequest;
    let makerResult: AgentRunResult;
    if (resumedMaker !== null) {
      makerResult = resumedMaker;
      makerRequest = immutableRequest({
        cycle: input,
        runId,
        iteration,
        role: "maker",
        snapshotHash,
        currentState,
        observations,
        previousEvaluation,
        allowedActions,
      });
      const invalidMaker = invalidResultReason(makerRequest, makerResult, true);
      if (invalidMaker !== null || !persistedEffectsAreValid(makerRequest, makerResult)) {
        return terminate("escalate", invalidMaker ?? "Persisted maker effect proof is invalid", "INVALID_AGENT_RESULT");
      }
      resumedMaker = null;
    } else {
      makerRequest = immutableRequest({
        cycle: input,
        runId,
        iteration,
        role: "maker",
        snapshotHash,
        currentState,
        observations,
        previousEvaluation,
        allowedActions,
      });
      await checkpoint({ phase: "before-invoke", status: "running", invocationRole: "maker" });
      makerResult = await dependencies.invoker.invoke(makerRequest);
      const invalidMaker = invalidResultReason(makerRequest, makerResult);
      if (invalidMaker !== null) {
        return terminate(
          "escalate",
          invalidMaker,
          invalidMaker.includes("policy ceiling") ? "ACTION_POLICY_VIOLATION" : "INVALID_AGENT_RESULT",
        );
      }
      const authoritativeMakerResult = await resolveConfirmedEffects(makerRequest, makerResult, dependencies, now().toISOString());
      if (authoritativeMakerResult === null) {
        return terminate("escalate", "Confirmed maker effect lacks exact host trust", "SIDE_EFFECT_UNKNOWN");
      }
      makerResult = authoritativeMakerResult;
      await dependencies.store.appendResult(makerResult);
      accumulatedCost += makerResult.cost;
      await checkpoint({ phase: "after-maker", status: "running", makerResult });
    }

    if (hasUnknownSideEffect(makerResult)) {
      return terminate(
        "escalate",
        "A consequential action has an unknown side-effect state and requires reconciliation",
        "SIDE_EFFECT_UNKNOWN",
      );
    }
    if (accumulatedCost > input.limits.maxCost) {
      return terminate("escalate", "Maximum prompt-cycle cost reached", "MAX_COST");
    }

    consecutiveNoProgress = lastProgressFingerprint !== null
      && makerResult.progressFingerprint === lastProgressFingerprint
      ? consecutiveNoProgress + 1
      : 0;
    lastProgressFingerprint = makerResult.progressFingerprint;
    if (consecutiveNoProgress >= input.limits.maxConsecutiveNoProgress) {
      return terminate("escalate", "No progress across consecutive maker iterations", "NO_PROGRESS");
    }

    let checkerResult: AgentRunResult | null = null;
    if (input.checker.enabled) {
      if (now().getTime() >= Date.parse(input.limits.deadline)) {
        return terminate("escalate", "Prompt-cycle deadline reached", "DEADLINE");
      }
      if (resumedChecker !== null) {
        checkerResult = resumedChecker;
        resumedChecker = null;
        const checkerRequest = immutableRequest({
          cycle: input, runId, iteration, role: "checker", snapshotHash, currentState,
          observations: [...observations, ...makerResult.observations], previousEvaluation,
          allowedActions: [], makerResultId: makerResult.resultId,
        });
        const invalidChecker = invalidResultReason(checkerRequest, checkerResult, true);
        if (invalidChecker !== null || !persistedEffectsAreValid(checkerRequest, checkerResult)) {
          return terminate("escalate", invalidChecker ?? "Persisted checker effect proof is invalid", "INVALID_AGENT_RESULT");
        }
      } else {
        const checkerRequest = immutableRequest({
          cycle: input,
          runId,
          iteration,
          role: "checker",
          snapshotHash,
          currentState,
          observations: [...observations, ...makerResult.observations],
          previousEvaluation,
          allowedActions: [],
          makerResultId: makerResult.resultId,
        });
        await checkpoint({
          phase: "before-checker",
          status: "running",
          invocationRole: "checker",
          makerResult,
        });
        checkerResult = await dependencies.invoker.invoke(checkerRequest);
        const invalidChecker = invalidResultReason(checkerRequest, checkerResult);
        if (invalidChecker !== null) {
          return terminate(
            "escalate",
            invalidChecker,
            invalidChecker.includes("policy ceiling") ? "ACTION_POLICY_VIOLATION" : "INVALID_AGENT_RESULT",
          );
        }
        const authoritativeCheckerResult = await resolveConfirmedEffects(checkerRequest, checkerResult, dependencies, now().toISOString());
        if (authoritativeCheckerResult === null) {
          return terminate("escalate", "Confirmed checker effect lacks exact host trust", "SIDE_EFFECT_UNKNOWN");
        }
        checkerResult = authoritativeCheckerResult;
        await dependencies.store.appendResult(checkerResult);
        accumulatedCost += checkerResult.cost;
        await checkpoint({
          phase: "after-checker",
          status: "running",
          makerResult,
          checkerResult,
        });
      }
      if (hasUnknownSideEffect(checkerResult)) {
        return terminate("escalate", "Checker reported an unknown side effect", "SIDE_EFFECT_UNKNOWN");
      }
      if (accumulatedCost > input.limits.maxCost) {
        return terminate("escalate", "Maximum prompt-cycle cost reached", "MAX_COST");
      }
    }

    const evaluation: CycleEvaluation = await dependencies.evaluator.evaluate({
      request: makerRequest,
      makerResult,
      checkerResult,
      accumulatedCost,
      consecutiveNoProgress,
    });
    const invalidEvaluation = invalidEvaluationReason(evaluation);
    if (invalidEvaluation !== null) return terminate("escalate", invalidEvaluation, "INVALID_AGENT_RESULT");
    previousEvaluation = evaluation.evaluationId;
    const hasConfirmedEffect = [...makerResult.actionAttempts, ...(checkerResult?.actionAttempts ?? [])]
      .some((attempt) => attempt.sideEffectState === "confirmed");
    if (hasConfirmedEffect && (evaluation.decision === "wait-human" || evaluation.decision === "wait-external")) {
      return terminate("escalate", "A confirmed consequential effect cannot enter a replayable wait", "SIDE_EFFECT_UNKNOWN", evaluation.evaluationId);
    }
    if (evaluation.decision === "continue") {
      if (evaluation.nextAllowedActions !== undefined) {
        const ceiling = new Set(allowedActions);
        if (evaluation.nextAllowedActions.some((action) => !ceiling.has(action))) {
          return terminate(
            "escalate",
            "Evaluator attempted to widen the trusted action ceiling",
            "ACTION_POLICY_VIOLATION",
            evaluation.evaluationId,
          );
        }
        allowedActions = [...evaluation.nextAllowedActions];
      }
      if (evaluation.nextInputSnapshotHash !== undefined) {
        if (!/^[a-f0-9]{64}$/.test(evaluation.nextInputSnapshotHash)) {
          return terminate(
            "escalate",
            "Evaluator returned an invalid snapshot hash",
            "INVALID_AGENT_RESULT",
            evaluation.evaluationId,
          );
        }
        snapshotHash = evaluation.nextInputSnapshotHash;
      }
      observations = evaluation.nextObservations
        ?? [...makerResult.observations, ...(checkerResult?.observations ?? [])];
      currentState = evaluation.nextCurrentState ?? currentState;
    }
    await checkpoint({
      phase: "after-evaluate",
      status: "running",
      decision: evaluation.decision,
      previousEvaluation: evaluation.evaluationId,
      evaluationReason: evaluation.reason,
      makerResult,
      ...(checkerResult === null ? {} : { checkerResult }),
    });

    if (evaluation.decision !== "continue") {
      return terminate(evaluation.decision, evaluation.reason, undefined, evaluation.evaluationId);
    }
    if (iteration >= input.limits.maxIterations) {
      return terminate("escalate", "Maximum iteration count reached", "MAX_ITERATIONS");
    }

    iteration += 1;
  }
}
