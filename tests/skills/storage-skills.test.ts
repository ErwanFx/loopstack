import { readFileSync } from "node:fs";
import { parse } from "yaml";
import { describe, expect, it } from "vitest";

const routes = {
  "loop-storage-design": "loop-connection-check",
  "loop-connection-check": "loop-storage-setup",
  "loop-storage-setup": "loop-eric-review",
} as const;

function readSkill(name: string) {
  const markdown = readFileSync(`skills/${name}/SKILL.md`, "utf8");
  const match = markdown.match(/^---\n([\s\S]*?)\n---\n/);
  if (!match) throw new Error(`${name} has no frontmatter`);
  return { markdown, frontmatter: parse(match[1]) as Record<string, string> };
}

describe("native storage workflow skills", () => {
  for (const [name, next] of Object.entries(routes)) {
    it(`${name} is valid and hands off to ${next}`, () => {
      const { markdown, frontmatter } = readSkill(name);
      expect(frontmatter.name).toBe(name);
      expect(frontmatter.description).toMatch(/^Use when/);
      expect(markdown).toContain("## Handoff");
      expect(markdown).toContain(next);
      expect(markdown.split("\n").length).toBeLessThan(500);
    });
  }

  it("uses the agent native connection instead of an embedded API client", () => {
    for (const name of Object.keys(routes)) {
      expect(readSkill(name).markdown.toLowerCase()).toContain("native connection");
    }
  });

  it("forces setup to stop before any mutation", () => {
    const markdown = readSkill("loop-storage-setup").markdown;
    expect(markdown).toContain("explicit approval");
    expect(markdown).toContain("Do not create");
    expect(markdown).toContain("never claim");
  });
});
