import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("plugin manifest", () => {
  it("matches the repository name and exposes skills", () => {
    const manifest = JSON.parse(readFileSync(".codex-plugin/plugin.json", "utf8"));
    expect(manifest.name).toBe("loopstack");
    expect(manifest.skills).toBe("./skills/");
  });
});
