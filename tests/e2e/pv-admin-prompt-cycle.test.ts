import { readFileSync } from "node:fs";
import { parse } from "yaml";
import { describe, expect, it } from "vitest";
import { runPromptCycle } from "../../src/orchestration/prompt-cycle.js";
import type {
  AgentRunRequest,
  AgentRunResult,
  PromptCycleCheckpoint,
} from "../../src/orchestration/prompt-cycle-types.js";
import { ProcessDefinitionSchema } from "../../src/process/schemas.js";
import { applyWorkItemEvent, createWorkItem } from "../../src/process/work-items.js";

describe("PV administration prompt cycle", () => {
  it("prepares evidence, obtains checker approval, then pauses at the human gate", async () => {
    const process = ProcessDefinitionSchema.parse(parse(
      readFileSync("tests/fixtures/v3/pv-admin/process.yaml", "utf8"),
    ));
    const item = createWorkItem(process, {
      id: "dossier-client-123",
      loopId: "pv-admin",
      eventAt: "2026-08-04T08:00:00.000Z",
    });
    const invocations: AgentRunRequest[] = [];
    const checkpoints: PromptCycleCheckpoint[] = [];
    const outcome = await runPromptCycle({
      loopId: "pv-admin",
      workItemId: item.id,
      runId: "run-pv-1",
      target: "dossier_submission_cycle_hours",
      currentState: item.currentState,
      inputSnapshotHash: "b".repeat(64),
      observations: ["documents-complete"],
      allowedActions: ["prepare-mairie-preview"],
      forbiddenActions: ["submit-mairie"],
      skills: ["pv-admin-playbook", "document-qa"],
      promptTemplateVersions: { maker: 1, checker: 1 },
      checker: { enabled: true, rubric: ["preview-complete"] },
      limits: {
        maxIterations: 3,
        maxCost: 2,
        deadline: "2026-08-04T12:00:00.000Z",
        maxConsecutiveNoProgress: 2,
      },
    }, {
      invoker: {
        async invoke(request: AgentRunRequest): Promise<AgentRunResult> {
          invocations.push(request);
          return {
            requestId: request.requestId,
            role: request.role,
            resultId: `${request.requestId}:result`,
            outputArtifactRefs: request.role === "maker" ? ["mairie-dossier-preview.pdf"] : [],
            actionAttempts: [],
            observations: ["preview-valid"],
            tokenUsage: 100,
            cost: 0.1,
            progressFingerprint: `${request.role}-complete`,
          };
        },
      },
      evaluator: {
        async evaluate() {
          return {
            decision: "wait-human" as const,
            reason: "official submission requires approval",
            evaluationId: "evaluation-gate-1",
          };
        },
      },
      store: {
        async loadCheckpoint() { return null; },
        async loadResult() { return null; },
        async saveCheckpoint(checkpoint) { checkpoints.push(checkpoint); },
        async appendResult() {},
      },
      now: () => new Date("2026-08-04T10:00:00.000Z"),
    });

    const waiting = await applyWorkItemEvent(process, item, {
      event: "dossier.complete",
      actor: "agent",
      occurredAt: "2026-08-04T10:00:00.000Z",
      idempotencyKey: "dossier-client-123:complete:1",
      expectedRevision: 0,
    }, {
      now: () => new Date("2026-08-04T10:00:00.000Z"),
      store: { async mutate() { return { kind: "applied" as const }; } },
    });

    expect(invocations.map(({ role }) => role)).toEqual(["maker", "checker"]);
    expect(outcome.decision).toBe("wait-human");
    expect(checkpoints.at(-1)?.status).toBe("waiting");
    expect(waiting.item).toMatchObject({
      currentState: "awaiting-mairie-approval",
      pendingGate: "approve-mairie-submission",
    });
  });
});
