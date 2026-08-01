import { describe, expect, it } from "vitest";
import { getRuntimeAdapter } from "../../src/runtimes/registry.js";
import { runtimeNames } from "../../src/runtimes/types.js";

describe("runtime contract", () => {
  it("ships Hermes and Claude Code adapters", () => {
    expect(runtimeNames).toEqual(["hermes", "claude-code"]);
  });

  it("rejects unknown runtime names", () => {
    expect(() => getRuntimeAdapter("zapier")).toThrow(/Unknown runtime/);
  });
});
