import { describe, expect, it } from "vitest";
import { createHandoff, InvalidHandoffError } from "../../src/domain/handoff.js";

const base = {
  loop_id: "seo-growth",
  completed_skill: "loop-design",
  status: "completed" as const,
  artifacts: ["loop.yaml"],
  blocking_requirements: [],
};

describe("skill handoffs", () => {
  it("accepts the configured next skill", () => {
    expect(createHandoff({ ...base, next_skill: "loop-storage-design" }).next_skill).toBe("loop-storage-design");
  });

  it("rejects skipping directly from design to deploy", () => {
    expect(() => createHandoff({ ...base, next_skill: "loop-deploy" })).toThrow(InvalidHandoffError);
  });

  it("allows blocked work to stop without a next skill", () => {
    const handoff = createHandoff({
      ...base,
      status: "blocked",
      next_skill: null,
      blocking_requirements: ["baseline metric is missing"],
    });
    expect(handoff.status).toBe("blocked");
  });

  it("routes design through native storage before Eric review", () => {
    expect(createHandoff({
      ...base,
      completed_skill: "loop-design",
      next_skill: "loop-storage-design",
    }).next_skill).toBe("loop-storage-design");
    expect(() => createHandoff({
      ...base,
      completed_skill: "loop-design",
      next_skill: "loop-eric-review",
    })).toThrow(InvalidHandoffError);
  });

  it("routes registry inspection into monitoring", () => {
    expect(createHandoff({
      ...base,
      completed_skill: "loop-list",
      next_skill: "loop-show",
    }).next_skill).toBe("loop-show");
    expect(createHandoff({
      ...base,
      completed_skill: "loop-show",
      next_skill: "loop-monitor",
    }).next_skill).toBe("loop-monitor");
  });
});
