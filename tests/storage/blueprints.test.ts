import { describe, expect, it } from "vitest";
import { createStorageBlueprint, logicalEntities, StorageBlueprintSchema } from "../../src/storage/blueprints.js";

describe("native storage blueprints", () => {
  it("defines the complete shared operational memory", () => {
    expect(logicalEntities).toEqual(expect.arrayContaining([
      "loops", "runs", "events", "decisions", "actions", "actionResults", "approvals", "alerts", "learnings",
    ]));
    expect(logicalEntities).toHaveLength(15);
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

  it("marks decisions and events append-only", () => {
    const blueprint = createStorageBlueprint("convex", "seo-growth");
    for (const entity of ["events", "decisions"]) {
      expect(blueprint.operations.find((operation) => operation.entity === entity)?.appendOnly).toBe(true);
    }
  });
});
