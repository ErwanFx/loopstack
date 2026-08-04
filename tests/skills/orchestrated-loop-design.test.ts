import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const cycle = "Target → Observe state → Evaluate/Plan → Act → Observe result → Evaluate outcome → Learn → Decide";

describe("orchestrated AI Loop skill contract", () => {
  it("makes the complete pre-action and post-action cycle canonical", () => {
    const design = readFileSync("skills/loop-design/SKILL.md", "utf8");
    const protocol = readFileSync("skills/loop-design/references/protocols/functional-design.md", "utf8");
    expect(design).toContain(cycle);
    expect(protocol).toContain(cycle);
    expect(protocol).toContain("Observe state");
    expect(protocol).toContain("Observe result");
    expect(protocol).toContain("Evaluate/Plan");
    expect(protocol).toContain("Evaluate outcome");
  });

  it("separates the durable business process from the agent control loop", () => {
    const design = readFileSync("skills/loop-design/SKILL.md", "utf8");
    const protocol = readFileSync("skills/loop-design/references/protocols/functional-design.md", "utf8");
    const combined = `${design}\n${protocol}`;
    expect(combined).toContain("business process");
    expect(combined).toContain("control loop");
    expect(combined).toContain("process.yaml");
    expect(combined).toContain("waiting-human");
    expect(combined).toContain("waiting-external");
    expect(combined).toContain("maker");
    expect(combined).toContain("checker");
    expect(combined).toContain("AgentRunRequest");
  });

  it("requires typed inert triggers and gates without mistaking scheduling for a loop", () => {
    const qualify = readFileSync("skills/loop-discover/references/protocols/loop-qualify/SKILL.md", "utf8");
    const design = readFileSync("skills/loop-design/SKILL.md", "utf8");
    const combined = `${qualify}\n${design}`;
    expect(combined).toContain("enabled: false");
    expect(combined).toContain("idempotency");
    expect(combined).toContain("timeout");
    expect(combined).toContain("A cron, webhook, state machine, or dashboard alone is not an AI Loop");
    expect(combined).toContain("human request");
  });

  it("carries the orchestrated contract through discover, plan, build, launch, and operate", () => {
    const discover = readFileSync("skills/loop-discover/SKILL.md", "utf8");
    const plan = readFileSync("skills/loop-plan/SKILL.md", "utf8");
    const build = readFileSync("skills/loop-build/SKILL.md", "utf8");
    const launch = readFileSync("skills/loop-launch/SKILL.md", "utf8");
    const operate = readFileSync("skills/loop-operate/SKILL.md", "utf8");
    expect(discover).toContain("last real work item");
    expect(discover).toContain("architecture shape");
    expect(plan).toContain("prompt-cycle controller");
    expect(plan).toContain("work-item state machine");
    expect(build).toContain("maker/checker");
    expect(build).toContain("controller resume");
    expect(launch).toContain("inert activation plan");
    expect(operate).toContain("work-item SLA");
    expect(operate).toContain("state distribution");
  });
});
