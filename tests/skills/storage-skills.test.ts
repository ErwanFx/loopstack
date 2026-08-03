import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const protocol = (path: string) => readFileSync(path, "utf8");

describe("consolidated storage protocols", () => {
  it("keeps storage design and connection checks inside loop-design", () => {
    const design = protocol("skills/loop-design/SKILL.md");
    expect(design).toContain("loop-storage-design/SKILL.md");
    expect(design).toContain("loop-connection-check/SKILL.md");
    expect(design).toContain("read-only connection check");
    expect(design).toContain("Do not implement, provision storage");
  });

  it("uses native connections rather than an embedded provider client", () => {
    for (const path of [
      "skills/loop-design/references/protocols/loop-storage-design/SKILL.md",
      "skills/loop-design/references/protocols/loop-connection-check/SKILL.md",
      "skills/loop-build/references/protocols/loop-storage-setup/SKILL.md",
    ]) expect(protocol(path).toLowerCase()).toContain("native connection");
  });

  it("moves storage mutations to build and preserves exact approval", () => {
    const build = protocol("skills/loop-build/SKILL.md");
    const setup = protocol("skills/loop-build/references/protocols/loop-storage-setup/SKILL.md");
    expect(build).toContain("matching plan hash");
    expect(build).toContain("separate approval checkpoints");
    expect(setup).toContain("explicit approval");
    expect(setup).toContain("Do not create");
    expect(setup).toContain("never claim");
  });

  it("keeps bootstrap and schema separately scoped", () => {
    const setup = protocol("skills/loop-build/references/protocols/loop-storage-setup/SKILL.md");
    expect(setup).toContain("Bootstrap mode");
    expect(setup).toContain("Schema mode");
    expect(setup).toContain("do not create tables");
  });
});
