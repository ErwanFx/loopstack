import { readFileSync } from "node:fs";
import { parse } from "yaml";
import { describe, expect, it } from "vitest";
import { normalizeHandoff, shouldAutoContinue } from "../../src/domain/handoff.js";

const fixturePath = "tests/fixtures/compat/v1/ecoi-seo-content/handoff.loop-eric-review.yaml";

function loadFixture() {
  return (parse(readFileSync(fixturePath, "utf8")) as { handoff: unknown }).handoff;
}

describe("ECOI v1 consolidated resume", () => {
  it("resumes at loop-plan without losing blockers or v1 metadata", () => {
    const normalized = normalizeHandoff(loadFixture());
    expect(normalized.source_route_version).toBe("v1");
    expect(normalized.journey).toBe("loop-design");
    expect(normalized.substage).toBe("loop-eric-review");
    expect(normalized.next_journey).toBe("loop-plan");
    expect(normalized.source.completed_skill).toBe("loop-eric-review");
    expect(normalized.source.next_skill).toBe("loop-plan");
    expect(normalized.source.blocking_requirements).toHaveLength(4);
    expect(normalized.source.planning_allowed).toBe(true);
    expect(normalized.source.activation_allowed).toBe(false);
    expect(normalized.source.review_version).toBe(2);
    expect(normalized.source.readiness).toEqual({
      status: "blocked",
      score: 68,
      blocking: ["data_access", "tested_alert_channel"],
    });
    expect(shouldAutoContinue(normalized.source)).toBe(true);
  });

  it("normalizes idempotently and does not route back through design or storage", () => {
    const first = normalizeHandoff(loadFixture());
    const second = normalizeHandoff(loadFixture());
    expect(second).toEqual(first);
    expect(first.next_journey).not.toBe("loop-design");
    expect(first.source.next_skill).not.toBe("loop-storage-design");
  });
});
