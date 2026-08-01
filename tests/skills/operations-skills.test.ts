import { readFileSync } from "node:fs";
import { parse } from "yaml";
import { describe, expect, it } from "vitest";

const routes: Record<string, string[]> = {
  "loop-implement": ["loop-qa"],
  "loop-qa": ["loop-deploy", "loop-debug"],
  "loop-deploy": ["loop-monitor"],
  "loop-monitor": ["loop-improve", "loop-modify", "loop-debug"],
  "loop-list": ["loop-show"],
  "loop-show": ["loop-monitor"],
  "loop-modify": ["loop-plan"],
  "loop-debug": ["loop-plan"],
  "loop-improve": ["loop-plan"],
};

function readSkill(name: string) {
  const markdown = readFileSync(`skills/${name}/SKILL.md`, "utf8");
  const match = markdown.match(/^---\n([\s\S]*?)\n---\n/);
  if (!match) throw new Error(`${name} has no frontmatter`);
  return { markdown, frontmatter: parse(match[1]) as Record<string, string> };
}

describe("operations skills", () => {
  for (const [name, nextSkills] of Object.entries(routes)) {
    it(`${name} is routed and concise`, () => {
      const { markdown, frontmatter } = readSkill(name);
      expect(frontmatter.name).toBe(name);
      expect(frontmatter.description).toMatch(/^Use when/);
      expect(markdown).toContain("## Handoff");
      for (const next of nextSkills) expect(markdown).toContain(next);
      expect(markdown.split("\n").length).toBeLessThan(500);
    });
  }

  it("requires implementation to match the approved plan hash", () => {
    expect(readSkill("loop-implement").markdown).toContain("matching plan hash");
  });

  it("requires machine-readable QA evidence", () => {
    expect(readSkill("loop-qa").markdown).toContain("machine-readable QA report");
  });

  it("deploys progressively from shadow after a pass verdict", () => {
    const markdown = readSkill("loop-deploy").markdown;
    expect(markdown).toContain("pass verdict");
    expect(markdown).toContain("shadow");
  });

  it("modifies only through semantic diff and a new plan", () => {
    const markdown = readSkill("loop-modify").markdown;
    expect(markdown).toContain("semantic diff");
    expect(markdown).toContain("loop-plan");
  });

  it("debugs before proposing modifications", () => {
    expect(readSkill("loop-debug").markdown).toContain("investigate before modification");
  });

  it("prevents silent structural self-improvement", () => {
    expect(readSkill("loop-improve").markdown).toContain("structural rules require a new approved plan");
  });
});
