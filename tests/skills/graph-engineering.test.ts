import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(path, "utf8");
const discover = `${read("skills/loop-discover/SKILL.md")}\n${read("skills/loop-discover/references/protocols/loop-qualify/SKILL.md")}`;
const design = `${read("skills/loop-design/SKILL.md")}\n${read("skills/loop-design/references/protocols/functional-design.md")}`;
const plan = read("skills/loop-plan/SKILL.md");
const build = read("skills/loop-build/SKILL.md");
const launch = read("skills/loop-launch/SKILL.md");
const operate = read("skills/loop-operate/SKILL.md");

describe("portable graph engineering skill contract", () => {
  it("chooses the least complex execution mode and defaults to one reusable agent profile", () => {
    expect(discover).toContain("deterministic-with-ai-improvement");
    expect(discover).toContain("single-agent-multi-session");
    expect(discover).toContain("multi-agent");
    expect(discover).toContain("default");
    expect(design).toContain("one agent profile");
    expect(design).toContain("fresh session");
  });

  it("creates graph.yaml only for real graph evidence", () => {
    expect(discover).toContain("graph necessity");
    expect(design).toContain("graph.yaml");
    expect(design).toContain("optional");
    expect(design).toContain("fake-edge");
    expect(design).toContain("prompts separate");
  });

  it("requires typed node contracts, complete fan-in, fresh review, and immutable anchors", () => {
    const contract = read("skills/loop-design/references/prompt-graph-contract.md");
    expect(contract).toContain("inputs");
    expect(contract).toContain("outputs");
    expect(contract).toContain("FAN_IN_INCOMPLETE");
    expect(contract).toContain("fresh context");
    expect(contract).toContain("immutable evidence anchor");
    expect(contract).toContain("idempotency");
  });

  it("keeps Hermes primary without losing Claude Code and Codex portability", () => {
    const combined = `${design}\n${plan}\n${build}`;
    expect(combined).toContain("Hermes");
    expect(combined).toContain("Claude Code");
    expect(combined).toContain("Codex");
    expect(combined).toContain("maxConcurrency: 1");
    expect(combined).toContain("dynamic workflows");
    expect(combined).toContain("sequential fallback");
  });

  it("tests graph execution before launch and observes node-level evidence afterward", () => {
    expect(plan).toContain("graph QA");
    expect(build).toContain("loopstack graph validate");
    expect(launch).toContain("topology hash");
    expect(operate).toContain("node-level");
    expect(operate).toContain("graph trace");
  });

  it("never silently self-modifies graph, prompts, skills, gates, or permissions", () => {
    const combined = `${design}\n${build}\n${operate}`;
    expect(combined).toContain("proposal only");
    expect(combined).toContain("graph");
    expect(combined).toContain("prompts");
    expect(combined).toContain("skills");
    expect(combined).toContain("gates");
    expect(combined).toContain("permissions");
  });
});
