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

function hasUnknownSideEffect(result: AgentRunResult): boolean {
  return result.actionAttempts.some((attempt) => attempt.sideEffectState === "unknown");
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
    allowedActions: Object.freeze(input.role === "checker" ? [] : [...input.allowedActions]),
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
  let resumeCount = existing === null ? 0 : existing.resumeCount + 1;
  let runId = runIdForResume(input.runId, resumeCount);
  let iteration = 1;
  let accumulatedCost = 0;
  let consecutiveNoProgress = 0;
  let lastProgressFingerprint: string | null = null;
  let previousEvaluation: string | null = null;
  let allowedActions: readonly string[] = [...input.allowedActions];
  let snapshotHash = input.inputSnapshotHash;
  let observations: readonly string[] = [...input.observations];
  let currentState = input.currentState;

  const checkpoint = async (
    fields: Partial<PromptCycleCheckpoint> & Pick<PromptCycleCheckpoint, "phase" | "status">,
  ): Promise<PromptCycleCheckpoint> => {
    const { phase, status, ...overrides } = fields;
    const saved: PromptCycleCheckpoint = {
      loopId: input.loopId,
      workItemId: input.workItemId,
      runId,
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

  if (existing !== null) {
    if (existing.status !== "running") {
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
    iteration = existing.phase === "after-evaluate" && existing.decision === "continue"
      ? existing.iteration + 1
      : existing.iteration;
    accumulatedCost = existing.accumulatedCost;
    consecutiveNoProgress = existing.consecutiveNoProgress;
    lastProgressFingerprint = existing.lastProgressFingerprint;
    previousEvaluation = existing.previousEvaluation;
    allowedActions = existing.allowedActions;
    snapshotHash = existing.inputSnapshotHash ?? snapshotHash;
    observations = existing.observations ?? observations;
    currentState = existing.currentState ?? currentState;

    if (existing.phase === "before-invoke" && existing.invocationRole !== "checker") {
      return terminate(
        "escalate",
        "An interrupted maker invocation may have an unreconciled side effect",
        "SIDE_EFFECT_UNKNOWN",
      );
    }
  }

  let resumedMaker = existing?.phase === "after-maker"
    || existing?.phase === "before-checker"
    || existing?.phase === "after-checker"
    ? existing.makerResult ?? null
    : null;
  let resumedChecker = existing?.phase === "after-checker" ? existing.checkerResult ?? null : null;

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
    if (accumulatedCost >= input.limits.maxCost) {
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
      if (accumulatedCost >= input.limits.maxCost) {
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
    previousEvaluation = evaluation.evaluationId;
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

    allowedActions = evaluation.nextAllowedActions ?? allowedActions;
    snapshotHash = evaluation.nextInputSnapshotHash ?? snapshotHash;
    observations = evaluation.nextObservations
      ?? [...makerResult.observations, ...(checkerResult?.observations ?? [])];
    currentState = evaluation.nextCurrentState ?? currentState;
    iteration += 1;
  }
}
