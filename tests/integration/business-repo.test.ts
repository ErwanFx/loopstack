import { existsSync, mkdtempSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parse } from "yaml";
import { describe, expect, it } from "vitest";
import {
  createBusinessRepoOverwriteContext,
  InMemoryOverwriteTrustResolver,
  initBusinessRepo,
  type OverwriteTrustRecord,
} from "../../src/commands/init-business-repo.js";

describe("business loops repository generator", () => {
  it("creates only the safe deterministic layout", () => {
    const root = mkdtempSync(join(tmpdir(), "business-loops-"));
    const target = join(root, "repo");
    const result = initBusinessRepo(target, { initializeGit: false, force: false });
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
    expect(() => initBusinessRepo(target, { initializeGit: false, force: false })).toThrowError(
      expect.objectContaining({ code: "TARGET_NOT_EMPTY" }),
    );
    expect(() => initBusinessRepo(target, { initializeGit: false, force: true })).toThrowError(
      expect.objectContaining({ code: "HOST_RESOLVER_REQUIRED" }),
    );
  });

  it("keeps the host resolver separate from caller-shaped options", () => {
    const target = mkdtempSync(join(tmpdir(), "business-loops-authorized-"));
    writeFileSync(join(target, "keep.txt"), "user data");
    const context = createBusinessRepoOverwriteContext(target, "opaque-overwrite", "plan-42");
    const callerOptions = {
      initializeGit: false,
      force: true,
      overwriteAuthorization: { ...context, resolver: { authorizeAndConsume: () => true } },
    };
    expect(() => initBusinessRepo(target, callerOptions as never)).toThrowError(
      expect.objectContaining({ code: "HOST_RESOLVER_REQUIRED" }),
    );
  });

  it("binds overwrite authorization to every exact field, freshness, and ordering", () => {
    const now = new Date("2026-08-04T14:00:00.000Z");
    const target = mkdtempSync(join(tmpdir(), "business-loops-bound-"));
    writeFileSync(join(target, "keep.txt"), "user data");
    const context = createBusinessRepoOverwriteContext(target, "opaque-overwrite", "plan-42");
    const trusted: OverwriteTrustRecord = {
      ...context,
      action: "overwrite-business-repo",
      target,
      issuedAt: "2026-08-04T13:00:00.000Z",
      expiresAt: "2026-08-04T15:00:00.000Z",
      nonce: "nonce-overwrite",
    };
    for (const override of [
      { evidenceId: "other-evidence" },
      { action: "other-action" },
      { target: `${target}-other` },
      { planId: "other-plan" },
      { planHash: "a".repeat(64) },
      { contentHash: "b".repeat(64) },
      { issuedAt: "not-a-date" },
      { expiresAt: "not-a-date" },
      { issuedAt: "2026-08-04T15:00:00.000Z", expiresAt: "2026-08-04T14:30:00.000Z" },
      { expiresAt: "2026-08-04T14:00:00.000Z" },
    ]) {
      const resolver = new InMemoryOverwriteTrustResolver([{ ...trusted, ...override } as OverwriteTrustRecord]);
      expect(() => initBusinessRepo(target, {
        initializeGit: false,
        force: true,
        overwriteAuthorization: context,
      }, resolver, now)).toThrowError(expect.objectContaining({ code: "HOST_RESOLVER_REQUIRED" }));
    }
  });

  it("recomputes the actual template and canonical plan hashes before consuming overwrite trust", () => {
    const now = new Date("2026-08-04T14:00:00.000Z");
    const target = mkdtempSync(join(tmpdir(), "business-loops-template-bound-"));
    writeFileSync(join(target, "keep.txt"), "user data");
    const exact = createBusinessRepoOverwriteContext(target, "opaque-overwrite", "plan-42");
    for (const forged of [
      { ...exact, contentHash: "b".repeat(64) },
      { ...exact, planHash: "a".repeat(64) },
    ]) {
      const resolver = new InMemoryOverwriteTrustResolver([{
        ...forged,
        action: "overwrite-business-repo",
        target,
        issuedAt: "2026-08-04T13:00:00.000Z",
        expiresAt: "2026-08-04T15:00:00.000Z",
        nonce: `nonce-${forged.contentHash.slice(0, 1)}-${forged.planHash.slice(0, 1)}`,
      }]);
      expect(() => initBusinessRepo(target, {
        initializeGit: false,
        force: true,
        overwriteAuthorization: forged,
      }, resolver, now)).toThrowError(expect.objectContaining({ code: "HOST_RESOLVER_REQUIRED" }));
    }
  });

  it("consumes exact overwrite authorization and rejects replay", () => {
    const now = new Date("2026-08-04T14:00:00.000Z");
    const target = mkdtempSync(join(tmpdir(), "business-loops-consumed-"));
    writeFileSync(join(target, "keep.txt"), "user data");
    const context = createBusinessRepoOverwriteContext(target, "opaque-overwrite", "plan-42");
    const resolver = new InMemoryOverwriteTrustResolver([{
      ...context,
      action: "overwrite-business-repo",
      target,
      issuedAt: "2026-08-04T13:00:00.000Z",
      expiresAt: "2026-08-04T15:00:00.000Z",
      nonce: "nonce-overwrite",
    }]);
    const options = {
      initializeGit: false,
      force: true,
      overwriteAuthorization: context,
    };
    expect(initBusinessRepo(target, options, resolver, now).created).toContain("registry.yaml");
    expect(() => initBusinessRepo(target, options, resolver, now)).toThrowError(
      expect.objectContaining({ code: "HOST_RESOLVER_REQUIRED" }),
    );
  });
});
