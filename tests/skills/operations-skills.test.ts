import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(path, "utf8");

describe("consolidated build, launch, and operate workflows", () => {
  it("requires build to match the approved plan hash and run QA automatically", () => {
    const build = read("skills/loop-build/SKILL.md");
    expect(build).toContain("matching plan hash");
    expect(build).toContain("run the failing test");
    expect(build).toContain("Run QA automatically");
    expect(build).toContain("machine-readable QA");
    expect(build).toContain("next_skill: loop-launch");
  });

  it("retains detailed implementation and QA evidence protocols", () => {
    const implement = read("skills/loop-build/references/protocols/loop-implement/SKILL.md");
    const qa = read("skills/loop-build/references/protocols/loop-qa/SKILL.md");
    expect(implement).toContain("matching plan hash");
    expect(qa).toContain("machine-readable QA report");
  });

  it("launches progressively from shadow after a fresh pass verdict", () => {
    const launch = read("skills/loop-launch/SKILL.md");
    const deploy = read("skills/loop-launch/references/protocols/loop-deploy/SKILL.md");
    expect(launch).toContain("fresh machine-readable QA pass");
    expect(launch).toContain("shadow → evidence review → canary");
    expect(deploy).toContain("pass verdict");
    expect(deploy).toContain("shadow");
  });

  it("routes all operating intents inside one public workflow", () => {
    const operate = read("skills/loop-operate/SKILL.md");
    for (const protocol of ["loop-list", "loop-show", "loop-monitor", "loop-debug", "loop-modify", "loop-improve"])
      expect(operate).toContain(protocol);
    expect(operate).toContain("next_skill: loop-plan");
  });

  it("preserves semantic diff, debug-first, and structural-change controls", () => {
    const modify = read("skills/loop-operate/references/protocols/loop-modify/SKILL.md");
    const debug = read("skills/loop-operate/references/protocols/loop-debug/SKILL.md");
    const improve = read("skills/loop-operate/references/protocols/loop-improve/SKILL.md");
    expect(modify).toContain("semantic diff");
    expect(modify).toContain("loop-plan");
    expect(debug).toContain("investigate before modification");
    expect(improve).toContain("structural rules require a new approved plan");
  });
});
