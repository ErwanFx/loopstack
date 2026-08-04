import { describe, expect, it } from "vitest";
import {
  promptCycleRunContractHash,
  runPromptCycle,
} from "../../src/orchestration/prompt-cycle.js";
import type {
  AgentInvoker,
  AgentRunRequest,
  AgentRunResult,
  CycleEvaluation,
  CycleEvaluator,
  EvaluationInput,
  EffectAuthorityExpectedEnvelope,
  EffectTrustEnvelope,
  PromptCycleCheckpoint,
  PromptCycleDependencies,
  PromptCycleInput,
  PromptCycleStore,
  PromptEffectAuthority,
} from "../../src/orchestration/prompt-cycle-types.js";

class MemoryStore implements PromptCycleStore {
  checkpoints: PromptCycleCheckpoint[] = [];
  results: AgentRunResult[] = [];

  constructor(private readonly existing: PromptCycleCheckpoint | null = null) {}

  async loadCheckpoint(): Promise<PromptCycleCheckpoint | null> {
    return this.checkpoints.at(-1) ?? this.existing;
  }

  async loadResult(requestId: string): Promise<AgentRunResult | null> {
    return this.results.find((result) => result.requestId === requestId) ?? null;
  }

  async saveCheckpoint(checkpoint: PromptCycleCheckpoint): Promise<void> {
    this.checkpoints.push(checkpoint);
  }

  async appendResult(result: AgentRunResult): Promise<void> {
    this.results.push(result);
  }
}

class InMemoryPromptEffectAuthority implements PromptEffectAuthority {
  private readonly evidence = new Map<string, EffectTrustEnvelope>();
  private readonly consumed = new Set<string>();
  private readonly recorded = new Map<string, AgentRunResult>();

  addEvidence(id: string, envelope: EffectTrustEnvelope): void { this.evidence.set(id, structuredClone(envelope)); }
  consumptionCount(): number { return this.consumed.size; }
  async loadRecordedResult(requestId: string): Promise<AgentRunResult | null> {
    return structuredClone(this.recorded.get(requestId) ?? null);
  }
  async verifyConsumeAndPersistResult(expected: EffectAuthorityExpectedEnvelope, result: AgentRunResult, hostNow: string): Promise<AgentRunResult | null> {
    if (this.recorded.has(result.requestId)) return structuredClone(this.recorded.get(result.requestId)!);
    if (expected.requestId !== result.requestId || !Number.isFinite(Date.parse(hostNow))) return null;
    for (const effect of expected.effects) {
      if (this.consumed.has(effect.evidenceId)
        || JSON.stringify(this.evidence.get(effect.evidenceId)) !== JSON.stringify(effect.envelope)) return null;
    }
    const canonical: AgentRunResult = { ...structuredClone(result), verifiedEffects: expected.effects.map((effect, index) => ({
      verificationId: `${result.requestId}:verification:${index}`,
      evidenceId: effect.evidenceId,
      envelope: structuredClone(effect.envelope),
      verifiedAt: hostNow,
    })) };
    for (const effect of expected.effects) this.consumed.add(effect.evidenceId);
    this.recorded.set(result.requestId, canonical);
    return structuredClone(canonical);
  }
}

class ScriptedInvoker implements AgentInvoker {
  invocations: AgentRunRequest[] = [];

  constructor(private readonly resultFor: (request: AgentRunRequest) => AgentRunResult) {}

  async invoke(request: AgentRunRequest): Promise<AgentRunResult> {
    this.invocations.push(request);
    return this.resultFor(request);
  }
}

class ScriptedEvaluator implements CycleEvaluator {
  inputs: EvaluationInput[] = [];
  private index = 0;

  constructor(private readonly evaluations: CycleEvaluation[]) {}

  async evaluate(input: EvaluationInput): Promise<CycleEvaluation> {
    this.inputs.push(input);
    return this.evaluations[Math.min(this.index++, this.evaluations.length - 1)]!;
  }
}

const baseInput: PromptCycleInput = {
  loopId: "pv-admin",
  workItemId: "dossier-client-123",
  runId: "run-1",
  target: "dossier_submission_cycle_hours",
  currentState: "collecting-documents",
  inputSnapshotHash: "a".repeat(64),
  observations: ["observation-1"],
  allowedActions: ["request-document", "prepare-mairie-preview"],
  forbiddenActions: ["submit-mairie"],
  skills: ["pv-admin-playbook", "document-qa"],
  promptTemplateVersions: { maker: 2, checker: 1 },
  checker: { enabled: true, rubric: ["all-required-documents", "no-forbidden-action"] },
  limits: {
    maxIterations: 8,
    maxCost: 4,
    deadline: "2026-08-04T12:00:00.000Z",
    maxConsecutiveNoProgress: 2,
  },
};

function resultFor(request: AgentRunRequest, overrides: Partial<AgentRunResult> = {}): AgentRunResult {
  return {
    requestId: request.requestId,
    role: request.role,
    resultId: `${request.requestId}:result`,
    outputArtifactRefs: [],
    actionAttempts: [],
    observations: [`${request.role}-observation-${request.iteration}`],
    tokenUsage: 100,
    cost: 0.1,
    progressFingerprint: `${request.role}-${request.iteration}`,
    ...overrides,
  };
}

const beforeDeadline = () => new Date("2026-08-04T10:00:00.000Z");

describe("bounded maker/checker prompt cycle", () => {
  it("reprompts the maker with checker feedback until success", async () => {
    const store = new MemoryStore();
    const invoker = new ScriptedInvoker((request) => resultFor(request));
    const evaluator = new ScriptedEvaluator([
      {
        decision: "continue",
        reason: "checker rejected the incomplete draft",
        evaluationId: "evaluation-rejected-1",
        nextAllowedActions: ["request-document"],
      },
      {
        decision: "stop-success",
        reason: "checker approved the corrected draft",
        evaluationId: "evaluation-approved-2",
      },
    ]);

    const outcome = await runPromptCycle(baseInput, { store, invoker, evaluator, now: beforeDeadline });

    expect(invoker.invocations.map((request) => request.role)).toEqual([
      "maker", "checker", "maker", "checker",
    ]);
    expect(invoker.invocations.filter(({ role }) => role === "checker").every(({ allowedActions }) => allowedActions.length === 0)).toBe(true);
    expect(invoker.invocations[2]?.previousEvaluation).toBe("evaluation-rejected-1");
    expect(invoker.invocations[2]?.allowedActions).toEqual(["request-document"]);
    expect(outcome.decision).toBe("stop-success");
    expect(store.checkpoints.at(-1)?.status).toBe("completed");
  });

  it("escalates when the maximum iteration count is reached", async () => {
    const invoker = new ScriptedInvoker((request) => resultFor(request));
    const outcome = await runPromptCycle({
      ...baseInput,
      limits: { ...baseInput.limits, maxIterations: 1 },
    }, {
      store: new MemoryStore(),
      invoker,
      evaluator: new ScriptedEvaluator([{
        decision: "continue",
        reason: "more work",
        evaluationId: "evaluation-1",
      }]),
      now: beforeDeadline,
    });

    expect(outcome).toMatchObject({ decision: "escalate", reasonCode: "MAX_ITERATIONS" });
    expect(invoker.invocations).toHaveLength(2);
  });

  it("checks cost and deadline bounds before continuing", async () => {
    const expensiveInvoker = new ScriptedInvoker((request) => resultFor(request, { cost: 5 }));
    const costOutcome = await runPromptCycle(baseInput, {
      store: new MemoryStore(),
      invoker: expensiveInvoker,
      evaluator: new ScriptedEvaluator([{
        decision: "stop-success",
        reason: "unused",
        evaluationId: "evaluation-1",
      }]),
      now: beforeDeadline,
    });
    expect(costOutcome).toMatchObject({ decision: "escalate", reasonCode: "MAX_COST" });
    expect(expensiveInvoker.invocations.map(({ role }) => role)).toEqual(["maker"]);

    const lateInvoker = new ScriptedInvoker((request) => resultFor(request));
    const deadlineOutcome = await runPromptCycle(baseInput, {
      store: new MemoryStore(),
      invoker: lateInvoker,
      evaluator: new ScriptedEvaluator([{
        decision: "stop-success",
        reason: "unused",
        evaluationId: "evaluation-1",
      }]),
      now: () => new Date("2026-08-04T12:00:00.000Z"),
    });
    expect(deadlineOutcome).toMatchObject({ decision: "escalate", reasonCode: "DEADLINE" });
    expect(lateInvoker.invocations).toHaveLength(0);
  });

  it("escalates after consecutive no-progress results", async () => {
    const invoker = new ScriptedInvoker((request) => resultFor(request, {
      progressFingerprint: request.role === "maker" ? "unchanged" : `checker-${request.iteration}`,
    }));
    const outcome = await runPromptCycle({
      ...baseInput,
      limits: { ...baseInput.limits, maxConsecutiveNoProgress: 1 },
    }, {
      store: new MemoryStore(),
      invoker,
      evaluator: new ScriptedEvaluator([{
        decision: "continue",
        reason: "try again",
        evaluationId: "evaluation-retry",
      }]),
      now: beforeDeadline,
    });

    expect(outcome).toMatchObject({ decision: "escalate", reasonCode: "NO_PROGRESS" });
    expect(invoker.invocations.map(({ role }) => role)).toEqual(["maker", "checker", "maker"]);
  });

  it("never retries an unknown consequential side effect", async () => {
    const invoker = new ScriptedInvoker((request) => resultFor(request, {
      actionAttempts: [{ action: "request-document", sideEffectState: "unknown" }],
    }));
    const outcome = await runPromptCycle(baseInput, {
      store: new MemoryStore(),
      invoker,
      evaluator: new ScriptedEvaluator([{
        decision: "continue",
        reason: "unused",
        evaluationId: "evaluation-1",
      }]),
      now: beforeDeadline,
    });

    expect(outcome).toMatchObject({ decision: "escalate", reasonCode: "SIDE_EFFECT_UNKNOWN" });
    expect(invoker.invocations).toHaveLength(1);
  });

  it("refuses a replayable wait after an externally verified effect", async () => {
    const authority = new InMemoryPromptEffectAuthority();
    authority.addEvidence("effect-1", {
      requestId: "run-1:1:maker", loopId: baseInput.loopId, runId: baseInput.runId,
      workItemId: baseInput.workItemId, role: "maker", action: "request-document",
      target: baseInput.target, idempotencyKey: "request-document-1",
    });
    const outcome = await runPromptCycle({ ...baseInput, checker: { enabled: false, rubric: [] } }, {
      store: new MemoryStore(),
      invoker: new ScriptedInvoker((request) => resultFor(request, { actionAttempts: [{
        action: "request-document", sideEffectState: "confirmed", requestId: request.requestId,
        effectEvidenceId: "effect-1", idempotencyKey: "request-document-1",
      }] })),
      effectAuthority: authority,
      evaluator: new ScriptedEvaluator([{ decision: "wait-human", reason: "approval", evaluationId: "wait-1" }]),
      now: beforeDeadline,
    });
    expect(outcome).toMatchObject({ decision: "escalate", reasonCode: "SIDE_EFFECT_UNKNOWN" });
  });

  it("ends the current run when human input is required", async () => {
    const store = new MemoryStore();
    const outcome = await runPromptCycle(baseInput, {
      store,
      invoker: new ScriptedInvoker((request) => resultFor(request)),
      evaluator: new ScriptedEvaluator([{
        decision: "wait-human",
        reason: "submission approval required",
        evaluationId: "evaluation-waiting-1",
      }]),
      now: beforeDeadline,
    });

    expect(outcome.decision).toBe("wait-human");
    expect(store.checkpoints.at(-1)?.status).toBe("waiting");
  });

  it("resumes a continued checkpoint in a new run without hidden session state", async () => {
    const existing: PromptCycleCheckpoint = {
      checkpointRevision: 0,
      runContractHash: promptCycleRunContractHash(baseInput),
      loopId: "pv-admin",
      workItemId: "dossier-client-123",
      baseRunId: "run-1",
      runId: "run-1",
      target: baseInput.target,
      promptTemplateVersions: baseInput.promptTemplateVersions,
      limits: baseInput.limits,
      initialInputSnapshotHash: baseInput.inputSnapshotHash,
      resumeCount: 0,
      iteration: 1,
      phase: "after-evaluate",
      status: "running",
      accumulatedCost: 0.2,
      consecutiveNoProgress: 0,
      lastProgressFingerprint: "draft-1",
      previousEvaluation: "evaluation-rejected-1",
      decision: "continue",
      allowedActions: ["request-document"],
      updatedAt: "2026-08-04T09:00:00.000Z",
    };
    const invoker = new ScriptedInvoker((request) => resultFor(request));
    const outcome = await runPromptCycle(baseInput, {
      store: new MemoryStore(existing),
      invoker,
      evaluator: new ScriptedEvaluator([{
        decision: "stop-success",
        reason: "corrected",
        evaluationId: "evaluation-approved-2",
      }]),
      now: beforeDeadline,
    });

    expect(invoker.invocations[0]).toMatchObject({
      runId: "run-1-resume-1",
      iteration: 2,
      workItemId: "dossier-client-123",
      previousEvaluation: "evaluation-rejected-1",
    });
    expect(outcome.decision).toBe("stop-success");
  });

  it("fails closed when a restart finds an unresolved before-invoke checkpoint", async () => {
    const existing: PromptCycleCheckpoint = {
      checkpointRevision: 0,
      runContractHash: promptCycleRunContractHash(baseInput),
      loopId: "pv-admin",
      workItemId: "dossier-client-123",
      baseRunId: "run-1",
      runId: "run-1",
      target: baseInput.target,
      promptTemplateVersions: baseInput.promptTemplateVersions,
      limits: baseInput.limits,
      initialInputSnapshotHash: baseInput.inputSnapshotHash,
      resumeCount: 0,
      iteration: 1,
      phase: "before-invoke",
      status: "running",
      accumulatedCost: 0,
      consecutiveNoProgress: 0,
      lastProgressFingerprint: null,
      previousEvaluation: null,
      decision: null,
      allowedActions: baseInput.allowedActions,
      updatedAt: "2026-08-04T09:00:00.000Z",
    };
    const invoker = new ScriptedInvoker((request) => resultFor(request));
    const outcome = await runPromptCycle(baseInput, {
      store: new MemoryStore(existing),
      invoker,
      evaluator: new ScriptedEvaluator([{
        decision: "continue",
        reason: "unused",
        evaluationId: "evaluation-1",
      }]),
      now: beforeDeadline,
    });

    expect(outcome).toMatchObject({ decision: "escalate", reasonCode: "SIDE_EFFECT_UNKNOWN" });
    expect(invoker.invocations).toHaveLength(0);
  });

  it("enforces the action ceiling and forbidden actions on maker and checker results", async () => {
    const invoker = new ScriptedInvoker((request) => resultFor(request, {
      actionAttempts: [{ action: request.role === "maker" ? "request-document" : "checker-write", sideEffectState: "none" }],
    }));
    const outcome = await runPromptCycle(baseInput, {
      store: new MemoryStore(), invoker,
      evaluator: new ScriptedEvaluator([{ decision: "stop-success", reason: "unused", evaluationId: "e-1" }]),
      now: beforeDeadline,
    });
    expect(outcome).toMatchObject({ decision: "escalate", reasonCode: "ACTION_POLICY_VIOLATION" });
    expect(invoker.invocations).toHaveLength(2);
  });

  it("rejects evaluator attempts to widen nextAllowedActions", async () => {
    const outcome = await runPromptCycle(baseInput, {
      store: new MemoryStore(),
      invoker: new ScriptedInvoker((request) => resultFor(request)),
      evaluator: new ScriptedEvaluator([{
        decision: "continue", reason: "widen", evaluationId: "e-1",
        nextAllowedActions: ["request-document", "submit-mairie"],
      }]),
      now: beforeDeadline,
    });
    expect(outcome).toMatchObject({ decision: "escalate", reasonCode: "ACTION_POLICY_VIOLATION" });
  });

  it("validates result identity, role, finite cost, actions, and artifact references before persistence", async () => {
    const invalidResults: Partial<AgentRunResult>[] = [
      { requestId: "other-request" },
      { role: "checker" },
      { cost: Number.NaN },
      { cost: -1 },
      { outputArtifactRefs: [""] },
      { actionAttempts: [{ action: "", sideEffectState: "none" }] },
      { actionAttempts: [{ action: "request-document", sideEffectState: "forged" as never }] },
    ];
    for (const invalid of invalidResults) {
      const store = new MemoryStore();
      const outcome = await runPromptCycle(baseInput, {
        store,
        invoker: new ScriptedInvoker((request) => resultFor(request, invalid)),
        evaluator: new ScriptedEvaluator([{ decision: "stop-success", reason: "unused", evaluationId: "e-1" }]),
        now: beforeDeadline,
      });
      expect(outcome.reasonCode).toBe("INVALID_AGENT_RESULT");
      expect(store.results).toHaveLength(0);
    }
  });

  it("persists all next iteration fields atomically with a continue decision", async () => {
    class CrashAfterContinueStore extends MemoryStore {
      async saveCheckpoint(checkpoint: PromptCycleCheckpoint): Promise<void> {
        await super.saveCheckpoint(checkpoint);
        if (checkpoint.phase === "after-evaluate" && checkpoint.decision === "continue") {
          expect(checkpoint.allowedActions).toEqual(["request-document"]);
          expect(checkpoint.inputSnapshotHash).toBe("d".repeat(64));
          expect(checkpoint.observations).toEqual(["next-observation"]);
          expect(checkpoint.currentState).toBe("next-state");
          throw new Error("simulated checkpoint crash");
        }
      }
    }
    await expect(runPromptCycle(baseInput, {
      store: new CrashAfterContinueStore(),
      invoker: new ScriptedInvoker((request) => resultFor(request)),
      evaluator: new ScriptedEvaluator([{
        decision: "continue", reason: "next", evaluationId: "e-1",
        nextAllowedActions: ["request-document"],
        nextInputSnapshotHash: "d".repeat(64),
        nextObservations: ["next-observation"],
        nextCurrentState: "next-state",
      }]),
      now: beforeDeadline,
    })).rejects.toThrow("simulated checkpoint crash");
  });

  it("accepts an exact maximum cost and escalates only when exceeded", async () => {
    const noChecker = { ...baseInput, checker: { enabled: false, rubric: [] }, limits: { ...baseInput.limits, maxCost: 1 } };
    const outcome = await runPromptCycle(noChecker, {
      store: new MemoryStore(),
      invoker: new ScriptedInvoker((request) => resultFor(request, { cost: 1 })),
      evaluator: new ScriptedEvaluator([{ decision: "stop-success", reason: "done", evaluationId: "e-1" }]),
      now: beforeDeadline,
    });
    expect(outcome.decision).toBe("stop-success");
  });

  it("resumes a waiting-human checkpoint only with an exact opaque capability", async () => {
    const store = new MemoryStore();
    const waiting = await runPromptCycle(baseInput, {
      store,
      invoker: new ScriptedInvoker((request) => resultFor(request)),
      evaluator: new ScriptedEvaluator([{
        decision: "wait-human", reason: "approval", evaluationId: "wait-1",
      }]),
      now: beforeDeadline,
    });
    expect(waiting.decision).toBe("wait-human");

    const invoker = new ScriptedInvoker((request) => resultFor(request));
    const resumed = await runPromptCycle({
      ...baseInput,
      inputSnapshotHash: "e".repeat(64),
      resumeCapabilityId: "resume-human-1",
    }, {
      store, invoker,
      resumeCapabilities: { async consume(id, expected) { return {
        id, ...expected,
        issuedAt: "2026-08-04T09:30:00.000Z", expiresAt: "2026-08-04T10:30:00.000Z",
      }; } },
      evaluator: new ScriptedEvaluator([{
        decision: "stop-success", reason: "resumed", evaluationId: "done-2",
      }]),
      now: beforeDeadline,
    });
    expect(resumed.decision).toBe("stop-success");
    expect(invoker.invocations[0]?.inputSnapshotHash).toBe("e".repeat(64));
    expect(store.checkpoints.some((checkpoint) => checkpoint.decision === "wait-human")).toBe(true);
  });

  it("fails closed when checkpoint target or prompt versions do not match", async () => {
    const store = new MemoryStore();
    await runPromptCycle(baseInput, {
      store,
      invoker: new ScriptedInvoker((request) => resultFor(request)),
      evaluator: new ScriptedEvaluator([{
        decision: "wait-external", reason: "external input", evaluationId: "wait-external-1",
      }]),
      now: beforeDeadline,
    });
    const outcome = await runPromptCycle({
      ...baseInput,
      target: "different-target",
      promptTemplateVersions: { maker: 999, checker: 1 },
    }, {
      store,
      invoker: new ScriptedInvoker((request) => resultFor(request)),
      evaluator: new ScriptedEvaluator([]),
      now: beforeDeadline,
    });
    expect(outcome).toMatchObject({ decision: "escalate", reasonCode: "CHECKPOINT_MISMATCH" });
  });

  it("recovers a host-verified maker effect after append without consuming one-shot evidence twice", async () => {
    class CrashAfterAppendStore extends MemoryStore {
      private crash = true;
      async saveCheckpoint(checkpoint: PromptCycleCheckpoint): Promise<void> {
        if (this.crash && checkpoint.phase === "after-maker") {
          this.crash = false;
          throw new Error("crash-after-maker-append");
        }
        await super.saveCheckpoint(checkpoint);
      }
    }
    const store = new CrashAfterAppendStore();
    const invoker = new ScriptedInvoker((request) => resultFor(request, { actionAttempts: [{
      action: "request-document", sideEffectState: "confirmed", requestId: request.requestId,
      effectEvidenceId: "effect-once", idempotencyKey: "request-document-once",
    }] }));
    const effectAuthority = new InMemoryPromptEffectAuthority();
    effectAuthority.addEvidence("effect-once", {
      requestId: "run-1:1:maker", loopId: baseInput.loopId, runId: baseInput.runId,
      workItemId: baseInput.workItemId, role: "maker", action: "request-document",
      target: baseInput.target, idempotencyKey: "request-document-once",
    });
    await expect(runPromptCycle({ ...baseInput, checker: { enabled: false, rubric: [] } }, {
      store, invoker, effectAuthority,
      evaluator: new ScriptedEvaluator([{ decision: "stop-success", reason: "done", evaluationId: "done-1" }]),
      now: beforeDeadline,
    })).rejects.toThrow("crash-after-maker-append");
    const recovered = await runPromptCycle({ ...baseInput, checker: { enabled: false, rubric: [] } }, {
      store, invoker, effectAuthority,
      evaluator: new ScriptedEvaluator([{ decision: "stop-success", reason: "done", evaluationId: "done-1" }]),
      now: beforeDeadline,
    });
    expect(recovered.decision).toBe("stop-success");
    expect(invoker.invocations.filter(({ role }) => role === "maker")).toHaveLength(1);
    expect(effectAuthority.consumptionCount()).toBe(1);
  });

  it("recovers after authority commit before prompt-store append without reinvoking or burning cost twice", async () => {
    class CrashBeforeAppendStore extends MemoryStore {
      private crash = true;
      async appendResult(result: AgentRunResult): Promise<void> {
        if (this.crash) { this.crash = false; throw new Error("crash-before-result-append"); }
        await super.appendResult(result);
      }
    }
    const store = new CrashBeforeAppendStore();
    const authority = new InMemoryPromptEffectAuthority();
    authority.addEvidence("effect-atomic", {
      requestId: "run-1:1:maker", loopId: baseInput.loopId, runId: baseInput.runId,
      workItemId: baseInput.workItemId, role: "maker", action: "request-document",
      target: baseInput.target, idempotencyKey: "request-document-atomic",
    });
    const invoker = new ScriptedInvoker((request) => resultFor(request, { cost: 0.7, actionAttempts: [{
      action: "request-document", sideEffectState: "confirmed", requestId: request.requestId,
      effectEvidenceId: "effect-atomic", idempotencyKey: "request-document-atomic",
    }] }));
    const cycleInput = { ...baseInput, checker: { enabled: false, rubric: [] } };
    const dependencies = {
      store, invoker, effectAuthority: authority,
      evaluator: new ScriptedEvaluator([{ decision: "stop-success", reason: "done", evaluationId: "done-atomic" }]),
      now: beforeDeadline,
    };
    await expect(runPromptCycle(cycleInput, dependencies)).rejects.toThrow("crash-before-result-append");
    const recovered = await runPromptCycle(cycleInput, dependencies);
    expect(recovered).toMatchObject({ decision: "stop-success", accumulatedCost: 0.7 });
    expect(invoker.invocations.filter(({ role }) => role === "maker")).toHaveLength(1);
    expect(authority.consumptionCount()).toBe(1);
    expect(store.results).toHaveLength(1);
  });

  it("recovers an exactly bound checker result after append commit and checkpoint save failure", async () => {
    class CrashAfterCheckerAppendStore extends MemoryStore {
      private crash = true;
      async saveCheckpoint(checkpoint: PromptCycleCheckpoint): Promise<void> {
        if (this.crash && checkpoint.phase === "after-checker") {
          this.crash = false;
          throw new Error("checker-checkpoint-save-failed");
        }
        await super.saveCheckpoint(checkpoint);
      }
    }
    const store = new CrashAfterCheckerAppendStore();
    const invoker = new ScriptedInvoker((request) => resultFor(request));
    const dependencies = {
      store, invoker,
      evaluator: new ScriptedEvaluator([{ decision: "stop-success", reason: "checked", evaluationId: "checker-done" }]),
      now: beforeDeadline,
    };
    await expect(runPromptCycle(baseInput, dependencies)).rejects.toThrow("checker-checkpoint-save-failed");
    const recovered = await runPromptCycle(baseInput, dependencies);
    expect(recovered).toMatchObject({ decision: "stop-success", accumulatedCost: 0.2 });
    expect(invoker.invocations.map(({ role }) => role)).toEqual(["maker", "checker"]);
    expect(store.results).toHaveLength(2);
  });

  it("rejects a caller-forged persisted effect marker", async () => {
    const store = new MemoryStore();
    const outcome = await runPromptCycle({ ...baseInput, checker: { enabled: false, rubric: [] } }, {
      store,
      invoker: new ScriptedInvoker((request) => ({ ...resultFor(request, { actionAttempts: [{
        action: "request-document", sideEffectState: "confirmed", requestId: request.requestId,
        effectEvidenceId: "effect-forged", idempotencyKey: "request-document-forged",
      }] }), verifiedEffects: [{ verificationId: "forged", evidenceId: "effect-forged" }] } as never)),
      effectAuthority: new InMemoryPromptEffectAuthority(),
      evaluator: new ScriptedEvaluator([{ decision: "stop-success", reason: "done", evaluationId: "done-1" }]),
      now: beforeDeadline,
    });
    expect(outcome).toMatchObject({ decision: "escalate", reasonCode: "INVALID_AGENT_RESULT" });
    expect(store.results).toHaveLength(0);
  });

  it("revalidates persisted results and controls null or malformed evaluator output", async () => {
    const malformedCheckpoint: PromptCycleCheckpoint = {
      checkpointRevision: 0,
      runContractHash: promptCycleRunContractHash(baseInput), loopId: baseInput.loopId,
      workItemId: baseInput.workItemId, baseRunId: baseInput.runId, runId: baseInput.runId,
      target: baseInput.target, promptTemplateVersions: baseInput.promptTemplateVersions, limits: baseInput.limits,
      initialInputSnapshotHash: baseInput.inputSnapshotHash, resumeCount: 0, iteration: 1,
      phase: "after-maker", status: "running", accumulatedCost: 0, consecutiveNoProgress: 0,
      lastProgressFingerprint: null, previousEvaluation: null, decision: null,
      allowedActions: baseInput.allowedActions, inputSnapshotHash: baseInput.inputSnapshotHash,
      observations: baseInput.observations, currentState: baseInput.currentState,
      makerResult: resultFor({ requestId: "run-1:1:maker", role: "maker" } as AgentRunRequest, { cost: Number.NaN }),
      updatedAt: "2026-08-04T09:00:00.000Z",
    };
    const persisted = await runPromptCycle(baseInput, {
      store: new MemoryStore(malformedCheckpoint),
      invoker: new ScriptedInvoker((request) => resultFor(request)),
      evaluator: new ScriptedEvaluator([]), now: beforeDeadline,
    });
    expect(persisted).toMatchObject({ decision: "escalate", reasonCode: "INVALID_AGENT_RESULT" });

    for (const malformed of [null, { decision: "continue" }]) {
      const outcome = await runPromptCycle({ ...baseInput, checker: { enabled: false, rubric: [] } }, {
        store: new MemoryStore(), invoker: new ScriptedInvoker((request) => resultFor(request)),
        evaluator: { async evaluate() { return malformed as never; } }, now: beforeDeadline,
      });
      expect(outcome).toMatchObject({ decision: "escalate", reasonCode: "INVALID_AGENT_RESULT" });
    }
  });

  it("rejects replay of a one-shot waiting resume capability", async () => {
    const store = new MemoryStore();
    await runPromptCycle(baseInput, {
      store, invoker: new ScriptedInvoker((request) => resultFor(request)),
      evaluator: new ScriptedEvaluator([{ decision: "wait-human", reason: "wait", evaluationId: "wait-1" }]),
      now: beforeDeadline,
    });
    let consumed = false;
    const resumeCapabilities = { async consume(id: string, expected: Parameters<NonNullable<PromptCycleDependencies["resumeCapabilities"]>["consume"]>[1]) {
      if (consumed) return null;
      consumed = true;
      return { id, ...expected,
        issuedAt: "2026-08-04T09:00:00.000Z", expiresAt: "2026-08-04T11:00:00.000Z" };
    } };
    const stillWaiting = await runPromptCycle({ ...baseInput, inputSnapshotHash: "e".repeat(64), resumeCapabilityId: "resume-1" }, {
      store, resumeCapabilities, invoker: new ScriptedInvoker((request) => resultFor(request)),
      evaluator: new ScriptedEvaluator([{ decision: "wait-human", reason: "wait again", evaluationId: "wait-2" }]),
      now: beforeDeadline,
    });
    expect(stillWaiting.decision).toBe("wait-human");
    const replayed = await runPromptCycle({ ...baseInput, inputSnapshotHash: "f".repeat(64), resumeCapabilityId: "resume-1" }, {
      store, resumeCapabilities, invoker: new ScriptedInvoker((request) => resultFor(request)),
      evaluator: new ScriptedEvaluator([]), now: beforeDeadline,
    });
    expect(replayed).toMatchObject({ decision: "escalate", reasonCode: "CHECKPOINT_MISMATCH" });
  });
});
