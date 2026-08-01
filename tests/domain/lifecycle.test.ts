import { describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import { canTransition, InvalidTransitionError, transition } from "../../src/domain/lifecycle.js";
import { LoopDefinitionSchema } from "../../src/domain/schemas.js";

const loop = LoopDefinitionSchema.parse({
  id: "seo-growth",
  name: "SEO Growth",
  version: 1,
  status: "building",
  target: { metric: "qualified_leads", desired: 40, horizonDays: 90 },
  current: { value: 12, observedAt: "2026-08-01T00:00:00.000Z" },
  triggers: [{ type: "manual" }],
  feedback: [{ metric: "qualified_leads", delayDays: 30 }],
});

describe("loop lifecycle", () => {
  it("allows QA success to become ready", () => {
    expect(canTransition("building", "ready")).toBe(true);
    expect(transition(loop, "ready").status).toBe("ready");
  });

  it("forbids deploying a designing loop", () => {
    expect(canTransition("designing", "active")).toBe(false);
    expect(() => transition({ ...loop, status: "designing" }, "active")).toThrow(InvalidTransitionError);
  });

  it("forces failed QA through qa-failed", () => {
    expect(canTransition("building", "qa-failed")).toBe(true);
    expect(canTransition("qa-failed", "active")).toBe(false);
  });

  it("reports invalid CLI transitions as JSON", () => {
    const result = spawnSync("pnpm", ["loopstack", "transition", "--from", "designing", "--to", "active"], {
      encoding: "utf8",
    });
    expect(result.status).toBe(2);
    expect(JSON.parse(result.stderr)).toMatchObject({ code: "INVALID_TRANSITION" });
  });
});
