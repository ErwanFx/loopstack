import { describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import { canTransition, GateEvidenceRequiredError, InvalidTransitionError, transition } from "../../src/domain/lifecycle.js";
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
  it("allows host-authorized QA success to become ready", () => {
    expect(canTransition("building", "ready")).toBe(true);
    const resolver = { authorizeAndConsume: () => true };
    expect(transition(loop, "ready", { evidenceId: "opaque-qa-id" }, resolver).status).toBe("ready");
  });

  it("forbids deploying a designing loop", () => {
    expect(canTransition("designing", "active")).toBe(false);
    expect(() => transition({ ...loop, status: "designing" }, "active")).toThrow(InvalidTransitionError);
  });

  it("forces failed QA through qa-failed", () => {
    expect(canTransition("building", "qa-failed")).toBe(true);
    expect(canTransition("qa-failed", "active")).toBe(false);
  });

  it("has no domain activation route that bypasses an injected consuming resolver", () => {
    const canary = { ...loop, status: "canary" as const };
    expect(() => transition(canary, "active")).toThrow(GateEvidenceRequiredError);
    const consumed = new Set<string>();
    const resolver = {
      authorizeAndConsume(request: { evidenceId: string; loopId: string; from: string; to: string }) {
        if (request.evidenceId !== "opaque-host-id" || request.loopId !== loop.id
          || request.from !== "canary" || request.to !== "active" || consumed.has(request.evidenceId)) return false;
        consumed.add(request.evidenceId);
        return true;
      },
    };
    expect(transition(canary, "active", { evidenceId: "opaque-host-id" }, resolver).status).toBe("active");
    expect(() => transition(canary, "active", { evidenceId: "opaque-host-id" }, resolver)).toThrow(GateEvidenceRequiredError);
  });

  it("never accepts a resolver smuggled inside caller-shaped authorization", () => {
    const canary = { ...loop, status: "canary" as const };
    const callerAuthorization = {
      evidenceId: "opaque-host-id",
      resolver: { authorizeAndConsume: () => true },
    };
    expect(() => transition(canary, "active", callerAuthorization as never)).toThrow(GateEvidenceRequiredError);
  });

  it("reports invalid CLI transitions as JSON", () => {
    const result = spawnSync("node", ["--import", "tsx", "src/cli.ts", "transition", "--from", "designing", "--to", "active"], {
      encoding: "utf8",
    });
    expect(result.status).toBe(2);
    expect(JSON.parse(result.stderr)).toMatchObject({ code: "INVALID_TRANSITION" });
  });
});
