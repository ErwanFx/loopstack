import { readFileSync, readdirSync } from "node:fs";
import { parse } from "yaml";
import { describe, expect, it } from "vitest";

const publicSkills = [
  "using-loopstack",
  "loop-discover",
  "loop-design",
  "loop-plan",
  "loop-build",
  "loop-launch",
  "loop-operate",
];

function frontmatter(path: string) {
  const source = readFileSync(path, "utf8");
  const match = source.match(/^---\n([\s\S]*?)\n---\n/);
  if (!match) throw new Error(`${path} has no frontmatter`);
  return parse(match[1]) as Record<string, unknown>;
}

function resourceFiles(root: string): string[] {
  return readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const path = `${root}/${entry.name}`;
    if (entry.isDirectory()) return resourceFiles(path);
    return /\.(?:md|html)$/.test(entry.name) ? [path] : [];
  });
}

describe("portable Loopstack skills", () => {
  it("keeps every public skill compatible with Codex frontmatter ingestion", () => {
    for (const skill of publicSkills) {
      expect(Object.keys(frontmatter(`skills/${skill}/SKILL.md`)).sort()).toEqual([
        "description",
        "name",
      ]);
    }
  });

  it("defines one learning contract with adapters for every supported runtime", () => {
    const learning = readFileSync("skills/loop-design/references/runtime-learning.md", "utf8");
    for (const runtime of ["Hermes", "Claude Code", "Codex"]) {
      expect(learning).toContain(`### ${runtime}`);
    }
    for (const requirement of [
      "Operational evidence",
      "Reusable procedures",
      "Durable facts",
      "Anti-noise",
      "Exclusions",
    ]) expect(learning).toContain(requirement);
    expect(learning).toContain("Operational learning is mandatory; self-modification is optional");
    expect(learning).toContain("plugin-provided skills are read-only");
    expect(learning).toContain("promoted learning proposal");
  });

  it("does not require Hermes-only capabilities for non-Hermes loop designs", () => {
    const design = readFileSync("skills/loop-design/SKILL.md", "utf8");
    const protocol = readFileSync("skills/loop-design/references/protocols/functional-design.md", "utf8");
    const storage = readFileSync("skills/loop-design/references/protocols/loop-storage-design/SKILL.md", "utf8");
    const combined = `${design}\n${protocol}\n${storage}`;
    expect(combined).not.toContain("Hermes native learning is mandatory in every AI Loop design");
    expect(combined).toContain("references/runtime-learning.md");
    expect(combined).toContain("self-contained HTML/SVG fallback");
  });

  it("keeps every packaged design resource free of universal Hermes requirements", () => {
    const content = resourceFiles("skills/loop-design/references")
      .map((file) => readFileSync(file, "utf8"))
      .join("\n");
    for (const prohibited of [
      "Hermes native Learn layer (all domains)",
      "Hermes native learning — obligatoire",
      "Hermes native learning is mandatory in Learn for every domain",
      "HTML blueprint mandatory; generated with architecture-diagram skill",
    ]) expect(content).not.toContain(prohibited);
  });
});
