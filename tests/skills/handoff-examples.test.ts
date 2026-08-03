import { readFileSync } from "node:fs";
import { parse } from "yaml";
import { describe, expect, it } from "vitest";
import { createHandoff } from "../../src/domain/handoff.js";

const publicSkills = [
  "using-loopstack",
  "loop-discover",
  "loop-design",
  "loop-plan",
  "loop-build",
  "loop-launch",
  "loop-operate",
];

describe("public skill handoff examples", () => {
  for (const skill of publicSkills) {
    it(`${skill} documents only valid machine handoffs`, () => {
      const markdown = readFileSync(`skills/${skill}/SKILL.md`, "utf8");
      const blocks = [...markdown.matchAll(/```yaml\n([\s\S]*?)\n```/g)];
      const handoffs = blocks
        .map((match) => parse(match[1]) as { handoff?: unknown })
        .filter((document) => document.handoff !== undefined);
      expect(handoffs.length).toBeGreaterThan(0);
      for (const document of handoffs) expect(() => createHandoff(document.handoff)).not.toThrow();
    });
  }
});
