import { describe, expect, it } from "vitest";
import { classifyChange, diffLoopVersions } from "../../src/operations/semantic-diff.js";
import { pinRunVersion, validateGeneratedWrapperChange } from "../../src/operations/versioning.js";

const before = {
  version: 3,
  process: { steps: ["research", "draft"] },
  approvals: { requiredFor: ["publish"] },
  thresholds: { confidence: 0.8 },
  storage: { provider: "convex" },
  alerts: { channel: "slack" },
  permissions: ["seo:read"],
};

describe("semantic loop versioning", () => {
  it("reports process, threshold, storage, and alert changes", () => {
    const after = {
      ...before,
      version: 4,
      process: { steps: ["research", "draft", "fact-check"] },
      thresholds: { confidence: 0.9 },
      storage: { provider: "airtable" },
      alerts: { channel: "email" },
    };
    const diff = diffLoopVersions(before, after);
    expect(diff.changes.map((change) => change.path)).toEqual(expect.arrayContaining([
      "process.steps.2", "thresholds.confidence", "storage.provider", "alerts.channel",
    ]));
    expect(classifyChange(diff)).toMatchObject({ migrationRequired: true, approvalRequired: true });
  });

  it("classifies approval removal and permission expansion as high risk", () => {
    const after = { ...before, version: 4, approvals: { requiredFor: [] }, permissions: ["seo:read", "cms:write"] };
    expect(classifyChange(diffLoopVersions(before, after)).risk).toBe("high-risk-structural");
  });

  it("pins a running execution to its starting version", () => {
    const run = pinRunVersion({ runId: "run-1", loopId: "seo-growth" }, 3);
    expect(run.loopVersion).toBe(3);
    expect(pinRunVersion(run, 4).loopVersion).toBe(3);
  });

  it("rejects wrapper-only edits without a canonical diff", () => {
    expect(() => validateGeneratedWrapperChange(diffLoopVersions(before, before), true)).toThrow(/canonical YAML/);
  });

  it("requires graph QA and high-risk review for anchors, gates, and topology", () => {
    const graphBefore = {
      ...before,
      graph: {
        nodes: [{ id: "review", kind: "evaluator" }, { id: "approval", kind: "human-gate" }],
        edges: [{ from: "review", to: "approval" }],
        anchors: [{ id: "source-data", immutable: true }],
      },
    };
    const graphAfter = {
      ...graphBefore,
      graph: {
        nodes: [{ id: "review", kind: "evaluator" }],
        edges: [],
        anchors: [],
      },
    };

    expect(classifyChange(diffLoopVersions(graphBefore, graphAfter))).toMatchObject({
      risk: "high-risk-structural",
      graphQaRequired: true,
      requiredTests: expect.arrayContaining(["graph-qa"]),
    });
  });
});
