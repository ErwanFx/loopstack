import { existsSync, mkdtempSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parse } from "yaml";
import { describe, expect, it } from "vitest";
import { initBusinessRepo } from "../../src/commands/init-business-repo.js";

describe("business loops repository generator", () => {
  it("creates only the safe deterministic layout", () => {
    const root = mkdtempSync(join(tmpdir(), "business-loops-"));
    const target = join(root, "repo");
    const result = initBusinessRepo(target, { initializeGit: false, force: false, approvedOverwrite: false });
    expect(result.created).toEqual([
      ".gitignore", "generated/.gitkeep", "loops/.gitkeep", "registry.yaml", "tests/.gitkeep",
    ]);
    expect(parse(readFileSync(join(target, "registry.yaml"), "utf8")).schemaVersion).toBe(1);
    expect(readFileSync(join(target, ".gitignore"), "utf8")).toContain(".env");
    expect(existsSync(join(target, ".git"))).toBe(false);
  });

  it("loads packaged templates independently of the caller working directory", () => {
    const originalCwd = process.cwd();
    const caller = mkdtempSync(join(tmpdir(), "loopstack-caller-"));
    const target = join(caller, "business-repo");
    process.chdir(caller);
    try {
      const result = initBusinessRepo(target, {
        initializeGit: false,
        force: false,
        approvedOverwrite: false,
      });
      expect(result.created).toContain("registry.yaml");
      expect(parse(readFileSync(join(target, "registry.yaml"), "utf8"))).toMatchObject({ schemaVersion: 1 });
    } finally {
      process.chdir(originalCwd);
    }
  });

  it("refuses a non-empty target without force and approved coverage", () => {
    const target = mkdtempSync(join(tmpdir(), "business-loops-existing-"));
    mkdirSync(join(target, "custom"));
    writeFileSync(join(target, "custom", "keep.txt"), "user data");
    expect(() => initBusinessRepo(target, { initializeGit: false, force: false, approvedOverwrite: false })).toThrowError(
      expect.objectContaining({ code: "TARGET_NOT_EMPTY" }),
    );
    expect(() => initBusinessRepo(target, { initializeGit: false, force: true, approvedOverwrite: false })).toThrowError(
      expect.objectContaining({ code: "PLAN_APPROVAL_REQUIRED" }),
    );
  });
});
