import { describe, expect, it } from "vitest";
import { createStorageBlueprint, logicalEntities, StorageBlueprintSchema } from "../../src/storage/blueprints.js";

describe("native storage blueprints", () => {
  it("defines the complete shared operational memory", () => {
    expect(logicalEntities).toEqual(expect.arrayContaining([
      "loops", "runs", "events", "decisions", "actions", "actionResults", "approvals", "alerts", "learnings",
      "workItems", "stateTransitions", "externalSubmissions", "deadlines", "learningProposals",
    ]));
    expect(logicalEntities).toHaveLength(20);
  });

  it.each(["convex", "airtable"] as const)("uses shared %s resources partitioned by loopId", (provider) => {
    const blueprint = createStorageBlueprint(provider, "seo-growth");
    expect(StorageBlueprintSchema.parse(blueprint).schemaVersion).toBe(1);
    expect(blueprint.isolation).toBe("shared-by-loop-id");
    expect(blueprint.operations.every((operation) => operation.fields.includes("loopId"))).toBe(true);
    expect(blueprint.operations.every((operation) => operation.destructive === false)).toBe(true);
  });

  it("uses one Sheets workbook per loop with entity worksheets", () => {
    const blueprint = createStorageBlueprint("google-sheets", "seo-growth");
    expect(blueprint.isolation).toBe("workbook-per-loop");
    expect(blueprint.container).toBe("loopstack-seo-growth");
    expect(blueprint.operations.map((operation) => operation.resource)).toContain("_loopstack_schema");
  });

  it("marks decisions, events, transitions, and external submissions append-only", () => {
    const blueprint = createStorageBlueprint("convex", "seo-growth");
    for (const entity of ["events", "decisions", "stateTransitions", "externalSubmissions"]) {
      expect(blueprint.operations.find((operation) => operation.entity === entity)?.appendOnly).toBe(true);
    }
  });

  it("defines focused durable-case fields without storing raw business documents", () => {
    const blueprint = createStorageBlueprint("convex", "pv-admin");
    const fields = (entity: string) => blueprint.operations
      .find((operation) => operation.entity === entity)?.fields;

    expect(fields("workItems")).toEqual(expect.arrayContaining([
      "loopId", "workItemId", "revision", "currentState", "pendingGate", "nextCheckAt",
    ]));
    expect(fields("stateTransitions")).toEqual(expect.arrayContaining([
      "loopId", "workItemId", "fromState", "toState", "idempotencyKey",
    ]));
    expect(fields("externalSubmissions")).toEqual(expect.arrayContaining([
      "loopId", "workItemId", "externalReference", "status", "evidenceHash",
    ]));
    expect(fields("deadlines")).toEqual(expect.arrayContaining([
      "loopId", "workItemId", "deadline", "status",
    ]));
    expect(fields("learningProposals")).toEqual(expect.arrayContaining([
      "loopId", "proposalId", "status", "targetArtifact", "evidenceIds",
    ]));
    expect(blueprint.operations.find(({ entity }) => entity === "workItems")?.indexes)
      .toEqual(expect.arrayContaining(["by_loop_id", "by_work_item_id"]));
    expect(blueprint.operations.find(({ entity }) => entity === "stateTransitions")?.indexes)
      .toEqual(expect.arrayContaining(["by_work_item_id", "by_idempotency_key"]));

    const prohibited = new Set(["rawDocument", "documentBody", "rawContent"]);
    expect(blueprint.operations.every((operation) =>
      operation.fields.every((field) => !prohibited.has(field)))).toBe(true);
    expect(new Set(fields("loops"))).not.toEqual(new Set(fields("workItems")));
  });
});
