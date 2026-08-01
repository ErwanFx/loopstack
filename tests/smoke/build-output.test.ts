import { existsSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("build output", () => {
  it("does not compile tests into the runtime distribution", () => {
    expect(existsSync("dist/tests")).toBe(false);
  });

  it("places the CLI at the package bin path", () => {
    expect(existsSync("dist/cli.js")).toBe(true);
  });
});
