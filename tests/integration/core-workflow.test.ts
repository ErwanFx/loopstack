import { describe, expect, it } from "vitest";
import { validateLoopFile } from "../../src/commands/validate.js";

describe("fixture-driven core workflow", () => {
  it("qualifies SEO for design and passes readiness", () => {
    const result = validateLoopFile("tests/fixtures/processes/seo-valid.yaml");
    expect(result.valid).toBe(true);
    expect(result.classification).toBe("AI Loop");
    expect(result.readiness.status).toBe("ready");
  });

  it("routes rule-based invoice work to deterministic automation", () => {
    const result = validateLoopFile("tests/fixtures/processes/invoice-deterministic.yaml");
    expect(result.valid).toBe(true);
    expect(result.classification).toBe("deterministic automation");
  });

  it("blocks unsafe outreach without approval, stop, and tested alerts", () => {
    const result = validateLoopFile("tests/fixtures/processes/unsafe-outreach.yaml");
    expect(result.valid).toBe(false);
    expect(result.readiness.blocking).toEqual(expect.arrayContaining([
      "approval_policy",
      "stop_and_escalation",
      "tested_alert_channel",
    ]));
  });
});
