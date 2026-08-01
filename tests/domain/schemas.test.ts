import { describe, expect, it } from "vitest";
import { assertLoopId } from "../../src/domain/ids.js";
import { HandoffSchema, LoopDefinitionSchema } from "../../src/domain/schemas.js";

const valid = {
  id: "seo-growth",
  name: "SEO Growth",
  version: 1,
  status: "designing",
  target: { metric: "qualified_leads", desired: 40, horizonDays: 90 },
  current: { value: 12, observedAt: "2026-08-01T00:00:00.000Z" },
  triggers: [{ type: "manual" }],
  feedback: [{ metric: "qualified_leads", delayDays: 30 }],
};

describe("LoopDefinitionSchema", () => {
  it("accepts a minimal measurable loop", () => {
    expect(LoopDefinitionSchema.parse(valid).id).toBe("seo-growth");
  });

  it("rejects an invalid loop identifier", () => {
    expect(() => LoopDefinitionSchema.parse({ ...valid, id: "SEO Growth" })).toThrow();
  });

  it("requires valid observations, triggers, and feedback", () => {
    expect(() => LoopDefinitionSchema.parse({ ...valid, current: { value: 12, observedAt: "today" } })).toThrow();
    expect(() => LoopDefinitionSchema.parse({ ...valid, triggers: [] })).toThrow();
    expect(() => LoopDefinitionSchema.parse({ ...valid, feedback: [] })).toThrow();
  });
});

describe("shared identifiers and handoffs", () => {
  it("asserts stable lowercase identifiers", () => {
    expect(assertLoopId("recruiting-loop")).toBe("recruiting-loop");
    expect(() => assertLoopId("Recruiting Loop")).toThrow();
  });

  it("accepts a machine-readable handoff", () => {
    const handoff = HandoffSchema.parse({
      loop_id: "seo-growth",
      completed_skill: "loop-design",
      status: "completed",
      artifacts: [],
      next_skill: "loop-eric-review",
      blocking_requirements: [],
    });
    expect(handoff.next_skill).toBe("loop-eric-review");
  });
});
