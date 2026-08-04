export async function createPromptCycleRun() {
  return {
    input: {
      loopId: "installed-smoke",
      workItemId: "work-1",
      runId: "run-1",
      target: "prove-installed-cli",
      currentState: "ready",
      inputSnapshotHash: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      observations: ["installed-package"],
      allowedActions: ["verify"],
      forbiddenActions: ["publish"],
      skills: ["installed-smoke"],
      promptTemplateVersions: { maker: 1, checker: 1 },
      checker: { enabled: false, rubric: [] },
      limits: {
        maxIterations: 1,
        maxCost: 1,
        deadline: "2099-01-01T00:00:00.000Z",
        maxConsecutiveNoProgress: 1,
      },
    },
    dependencies: {
      store: {
        async loadCheckpoint() { return null; },
        async saveCheckpoint() {},
        async appendResult() {},
      },
      invoker: {
        async invoke(request) {
          return {
            requestId: request.requestId,
            resultId: `${request.requestId}:result`,
            outputArtifactRefs: [],
            actionAttempts: [],
            observations: ["installed-cli-executed"],
            tokenUsage: 1,
            cost: 0.01,
            progressFingerprint: "installed-cli-executed",
          };
        },
      },
      evaluator: {
        async evaluate() {
          return { decision: "stop-success", reason: "installed CLI works", evaluationId: "evaluation-1" };
        },
      },
    },
  };
}
