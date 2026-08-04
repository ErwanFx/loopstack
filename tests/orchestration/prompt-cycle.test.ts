import { describe, expect, it } from "vitest";
import {
  runPromptCycle,
} from "../../src/orchestration/prompt-cycle.js";
import type {
  AgentInvoker,
  AgentRunRequest,
  AgentRunResult,
  CycleEvaluation,
  CycleEvaluator,
  EvaluationInput,
  PromptCycleCheckpoint,
  PromptCycleInput,
  PromptCycleStore,
} from "../../src/orchestration/prompt-cycle-types.js";

class MemoryStore implements PromptCycleStore {
  checkpoints: PromptCycleCheckpoint[] = [];
  results: AgentRunResult[] = [];

  constructor(private readonly existing: PromptCycleCheckpoint | null = null) {}

  async loadCheckpoint(): Promise<PromptCycleCheckpoint | null> {
    return this.checkpoints.at(-1) ?? this.existing;
  }

  async saveCheckpoint(checkpoint: PromptCycleCheckpoint): Promise<void> {
    this.checkpoints.push(checkpoint);
  }

  async appendResult(result: AgentRunResult): Promise<void> {
    this.results.push(result);
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
      actionAttempts: [{ action: "submit-mairie", sideEffectState: "unknown" }],
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
      loopId: "pv-admin",
      workItemId: "dossier-client-123",
      runId: "run-1",
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
      loopId: "pv-admin",
      workItemId: "dossier-client-123",
      runId: "run-1",
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
});
