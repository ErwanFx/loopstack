import { readFileSync } from "node:fs";
import { parse } from "yaml";
import { describe, expect, it } from "vitest";

const routes: Record<string, string[]> = {
  "using-loopstack": ["loop-idea"],
  "loop-idea": ["loop-qualify"],
  "loop-qualify": ["loop-design"],
  "loop-design": ["loop-storage-design"],
  "loop-eric-review": ["loop-plan", "loop-design"],
  "loop-plan": ["loop-implement"],
};

function readSkill(name: string): { frontmatter: Record<string, string>; markdown: string } {
  const markdown = readFileSync(`skills/${name}/SKILL.md`, "utf8");
  const match = markdown.match(/^---\n([\s\S]*?)\n---\n/);
  if (!match) throw new Error(`${name} has no YAML frontmatter`);
  return { frontmatter: parse(match[1]) as Record<string, string>, markdown };
}

describe("core workflow skills", () => {
  for (const [directoryName, nextSkills] of Object.entries(routes)) {
    it(`${directoryName} is concise, discoverable, and routed`, () => {
      const { frontmatter, markdown } = readSkill(directoryName);
      expect(frontmatter.name).toBe(directoryName);
      expect(frontmatter.description).toMatch(/^Use when/);
      expect(frontmatter.description.length).toBeLessThanOrEqual(1024);
      expect(markdown.split("\n").length).toBeLessThan(500);
      expect(markdown).toContain("## Handoff");
      for (const nextSkill of nextSkills) expect(markdown).toContain(nextSkill);
    });
  }

  it("keeps the interview adaptive and evidence-led", () => {
    const { markdown } = readSkill("loop-idea");
    expect(markdown).toContain("one question at a time");
    expect(markdown).toContain("current workaround");
    expect(markdown).toContain("direct observation");
  });

  it("distinguishes AI loops from eight alternatives", () => {
    const { markdown } = readSkill("loop-qualify");
    for (const classification of [
      "AI Loop",
      "AI-assisted workflow",
      "deterministic automation",
      "on-demand agent task",
      "monitoring or reporting system",
      "human SOP or approval process",
      "data pipeline",
      "one-time project",
      "multiple independent loops requiring decomposition",
    ]) expect(markdown).toContain(classification);
  });

  it("never lets Eric review scoring bypass blockers", () => {
    const { markdown } = readSkill("loop-eric-review");
    expect(markdown).toContain("target / current / gap");
    expect(markdown).toContain("never override a blocker");
  });

  it("stops planning at explicit approval", () => {
    const { markdown } = readSkill("loop-plan");
    expect(markdown).toContain("explicit approval");
    expect(markdown).toContain("Do not implement");
  });
});
