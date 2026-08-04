import { describe, expect, it } from "vitest";
import { getRuntimeAdapter } from "../../src/runtimes/registry.js";
import { runtimeNames } from "../../src/runtimes/types.js";

describe("runtime contract", () => {
  it("ships Hermes, Claude Code, and Codex adapters", () => {
    expect(runtimeNames).toEqual(["hermes", "claude-code", "codex"]);
    for (const runtime of runtimeNames) expect(getRuntimeAdapter(runtime).name).toBe(runtime);
  });

  it("rejects unknown runtime names", () => {
    expect(() => getRuntimeAdapter("zapier")).toThrow(/Unknown runtime/);
  });
});
