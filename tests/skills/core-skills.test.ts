import { readFileSync } from "node:fs";
import { parse } from "yaml";
import { describe, expect, it } from "vitest";

const publicRoutes: Record<string, string[]> = {
  "using-loopstack": ["loop-discover"],
  "loop-discover": ["loop-design"],
  "loop-design": ["loop-plan"],
  "loop-plan": ["loop-build"],
};

function readSkill(name: string): { frontmatter: Record<string, string>; markdown: string } {
  const markdown = readFileSync(`skills/${name}/SKILL.md`, "utf8");
  const match = markdown.match(/^---\n([\s\S]*?)\n---\n/);
  if (!match) throw new Error(`${name} has no YAML frontmatter`);
  return { frontmatter: parse(match[1]) as Record<string, string>, markdown };
}

function readProtocol(path: string) {
  return readFileSync(path, "utf8");
}

describe("core consolidated workflow skills", () => {
  for (const [directoryName, nextSkills] of Object.entries(publicRoutes)) {
    it(`${directoryName} is concise, discoverable, and routed`, () => {
      const { frontmatter, markdown } = readSkill(directoryName);
      expect(frontmatter.name).toBe(directoryName);
      expect(frontmatter.description).toMatch(/^Use when/);
      expect(frontmatter.description.length).toBeLessThanOrEqual(1024);
      expect(markdown.split("\n").length).toBeLessThan(260);
      expect(markdown).toContain("## Handoff");
      for (const nextSkill of nextSkills) expect(markdown).toContain(nextSkill);
    });
  }

  it("keeps discovery adaptive and evidence-led behind one public phase", () => {
    const discover = readSkill("loop-discover").markdown;
    const protocol = readProtocol("skills/loop-discover/references/protocols/loop-idea/SKILL.md");
    expect(discover).toContain("Ask one question at a time");
    expect(protocol).toContain("current workaround");
    expect(protocol).toContain("direct observation");
  });

  it("keeps all nine classification alternatives in the internal protocol", () => {
    const protocol = readProtocol("skills/loop-discover/references/protocols/loop-qualify/SKILL.md");
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
    ]) expect(protocol).toContain(classification);
  });

  it("integrates critical review without letting scoring bypass blockers", () => {
    const design = readSkill("loop-design").markdown;
    const protocol = readProtocol("skills/loop-design/references/protocols/loop-eric-review/SKILL.md");
    expect(design).toContain("Integrated critical review");
    expect(protocol).toContain("target / current / gap");
    expect(protocol).toContain("never override a blocker");
    expect(protocol).toContain("Design verdict vs activation readiness");
  });

  it("stops planning at explicit approval then routes to build", () => {
    const markdown = readSkill("loop-plan").markdown;
    expect(markdown).toContain("explicit approval");
    expect(markdown).toContain("Do not implement");
    expect(markdown).toContain("next_skill: loop-build");
  });
});
