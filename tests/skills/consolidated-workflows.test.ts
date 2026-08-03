import { readFileSync } from "node:fs";
import { parse } from "yaml";
import { describe, expect, it } from "vitest";
import {
  createHandoff,
  legacySkillAliases,
  publicSkillRoute,
  resolvePublicSkill,
  shouldAutoContinue,
} from "../../src/domain/handoff.js";

const publicSkills = [
  "using-loopstack",
  "loop-discover",
  "loop-design",
  "loop-plan",
  "loop-build",
  "loop-launch",
  "loop-operate",
] as const;

function readSkill(name: string) {
  const markdown = readFileSync(`skills/${name}/SKILL.md`, "utf8");
  const match = markdown.match(/^---\n([\s\S]*?)\n---\n/);
  if (!match) throw new Error(`${name} has no frontmatter`);
  return { markdown, frontmatter: parse(match[1]) as Record<string, string> };
}

const completed = (completed_skill: string, next_skill: string) => ({
  loop_id: "seo-growth",
  completed_skill,
  status: "completed" as const,
  artifacts: ["evidence.yaml"],
  next_skill,
  blocking_requirements: [],
});

const publicCompleted = (completed_skill: string, next_skill: string) => ({
  ...completed(completed_skill, next_skill),
  route_version: "v2" as const,
  journey: completed_skill,
  substage: completed_skill,
  next_journey: next_skill,
  completed_workers: [completed_skill],
  pending_gate: null,
  scope_hash: "a".repeat(64),
  artifact_hashes: {},
  gate_evidence: [],
});

describe("consolidated public workflows", () => {
  it("registers exactly seven public skills in Hermes", () => {
    const source = readFileSync("__init__.py", "utf8");
    for (const name of publicSkills) expect(source).toContain(`"${name}"`);
    expect(source).toContain("PUBLIC_SKILLS");
    expect(source).not.toContain("for skill_dir in sorted(skills_root.iterdir())");
  });

  it("keeps every public workflow concise and discoverable", () => {
    for (const name of publicSkills) {
      const { markdown, frontmatter } = readSkill(name);
      expect(frontmatter.name).toBe(name);
      expect(frontmatter.description).toMatch(/^Use when/);
      expect(markdown.split("\n").length).toBeLessThan(260);
      expect(markdown).toContain("## Handoff");
    }
  });

  it("has one coherent public route", () => {
    expect(publicSkillRoute).toEqual({
      "using-loopstack": ["loop-discover"],
      "loop-discover": ["loop-design"],
      "loop-design": ["loop-plan"],
      "loop-plan": ["loop-build"],
      "loop-build": ["loop-launch"],
      "loop-launch": ["loop-operate"],
      "loop-operate": ["loop-operate", "loop-plan"],
    });
  });

  it("maps v1 skills to public workflows", () => {
    expect(legacySkillAliases["loop-idea"]).toBe("loop-discover");
    expect(legacySkillAliases["loop-storage-design"]).toBe("loop-design");
    expect(legacySkillAliases["loop-storage-setup"]).toBe("loop-build");
    expect(legacySkillAliases["loop-qa"]).toBe("loop-build");
    expect(legacySkillAliases["loop-deploy"]).toBe("loop-launch");
    expect(legacySkillAliases["loop-monitor"]).toBe("loop-operate");
    expect(resolvePublicSkill("loop-eric-review")).toBe("loop-design");
    expect(Object.keys(legacySkillAliases).sort()).toEqual([
      "loop-connection-check", "loop-debug", "loop-deploy", "loop-eric-review",
      "loop-idea", "loop-implement", "loop-improve", "loop-list", "loop-modify",
      "loop-monitor", "loop-qa", "loop-qualify", "loop-show", "loop-storage-design",
      "loop-storage-setup", "using-loopstack",
    ]);
    for (const publicSkill of Object.values(legacySkillAliases))
      expect(Object.keys(publicSkillRoute)).toContain(publicSkill);
  });

  it("auto-continues completed transitions but stops at approval and blockers", () => {
    expect(shouldAutoContinue(createHandoff(publicCompleted("loop-discover", "loop-design")))).toBe(true);
    expect(shouldAutoContinue(createHandoff({
      ...completed("loop-plan", "loop-build"),
      status: "awaiting-approval",
      next_skill: null,
      blocking_requirements: ["explicit plan approval"],
    }))).toBe(false);
    expect(shouldAutoContinue(createHandoff({
      ...completed("loop-build", "loop-launch"),
      status: "blocked",
      next_skill: null,
      blocking_requirements: ["QA failed"],
    }))).toBe(false);
  });

  it("accepts the existing ECOI v1 resume route without repeating design", () => {
    const handoff = createHandoff(completed("loop-eric-review", "loop-plan"));
    expect(handoff.next_skill).toBe("loop-plan");
    expect(resolvePublicSkill(handoff.next_skill!)).toBe("loop-plan");
    expect(shouldAutoContinue(handoff)).toBe(true);
  });

  it("still rejects skips across plan, build, or launch", () => {
    expect(() => createHandoff(completed("loop-design", "loop-launch"))).toThrow();
    expect(() => createHandoff(completed("loop-plan", "loop-operate"))).toThrow();
    expect(() => createHandoff(completed("loop-build", "loop-operate"))).toThrow();
  });

  it("encodes Superpowers-style continuous flow without widening approval", () => {
    const router = readSkill("using-loopstack").markdown;
    expect(router).toContain("Continuous flow");
    expect(router).toContain("Do not ask “should I continue?”");
    expect(router).toContain("Approval scope never widens");
    expect(router).toContain("fresh verification evidence");
  });
});
