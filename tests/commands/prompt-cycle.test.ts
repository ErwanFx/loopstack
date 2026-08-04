import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { runPromptCycleCommand } from "../../src/commands/prompt-cycle.js";

function writeLoopModule(): string {
  const root = mkdtempSync(join(tmpdir(), "loopstack-prompt-cycle-"));
  const modulePath = join(root, "prompt-cycle.mjs");
  writeFileSync(modulePath, `
export async function createPromptCycleRun(context) {
  if (context.loopReference !== ${JSON.stringify(modulePath)}) throw new Error("wrong loop reference");
  return {
    input: {
      loopId: "audit-loop",
      workItemId: "work-1",
      runId: "run-1",
      target: "qualified_leads",
      currentState: "ready",
      inputSnapshotHash: "${"a".repeat(64)}",
      observations: ["seed-loaded"],
      allowedActions: ["draft"],
      forbiddenActions: ["publish"],
      skills: ["audit-loop"],
      promptTemplateVersions: { maker: 1, checker: 1 },
      checker: { enabled: false, rubric: [] },
      limits: {
        maxIterations: 2,
        maxCost: 2,
        deadline: "2099-01-01T00:00:00.000Z",
        maxConsecutiveNoProgress: 1
      }
    },
    dependencies: {
      store: {
        async loadCheckpoint() { return null; },
        async loadResult() { return null; },
        async saveCheckpoint() {},
        async appendResult() {}
      },
      invoker: {
        async invoke(request) {
          return {
            requestId: request.requestId,
            role: request.role,
            resultId: request.requestId + ":result",
            outputArtifactRefs: [],
            actionAttempts: [],
            observations: ["draft-created"],
            tokenUsage: 10,
            cost: 0.1,
            progressFingerprint: "draft-1"
          };
        }
      },
      evaluator: {
        async evaluate() {
          return { decision: "stop-success", reason: "done", evaluationId: "evaluation-1" };
        }
      }
    }
  };
}
`);
  return modulePath;
}

describe("prompt-cycle CLI", () => {
  it("loads a loop-owned module and executes the bounded controller", async () => {
    const modulePath = writeLoopModule();
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);

    const code = await runPromptCycleCommand(["run", "--loop", modulePath]);

    expect(code).toBe(0);
    expect(JSON.parse(String(log.mock.calls[0]?.[0]))).toMatchObject({
      decision: "stop-success",
      runId: "run-1",
      iteration: 1,
    });
    log.mockRestore();
  });

  it("fails closed when the loop module does not expose the runtime contract", async () => {
    const root = mkdtempSync(join(tmpdir(), "loopstack-prompt-cycle-invalid-"));
    const modulePath = join(root, "prompt-cycle.mjs");
    writeFileSync(modulePath, "export const invalid = true;\n");
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);

    const code = await runPromptCycleCommand(["run", "--loop", modulePath]);

    expect(code).toBe(2);
    expect(JSON.parse(String(error.mock.calls[0]?.[0]))).toMatchObject({
      code: "PROMPT_CYCLE_FAILED",
    });
    error.mockRestore();
  });
});
