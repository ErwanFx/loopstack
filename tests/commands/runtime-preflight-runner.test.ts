import { describe, expect, it } from "vitest";
import { commandRunner } from "../../src/commands/runtime-preflight.js";

describe("runtime preflight command runner", () => {
  it("requests untruncated tabular CLI output", async () => {
    const result = await commandRunner(process.execPath, [
      "-e",
      "process.stdout.write(process.env.COLUMNS || '')",
    ]);

    expect(result).toEqual({ exitCode: 0, stdout: "500", stderr: "" });
  });
});
