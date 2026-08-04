import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { inspectGraphFile, validateGraphFile } from "../../src/commands/graph.js";
import { portableGraph } from "../fixtures/prompt-graph.js";

function yamlFile(contents: string): string {
  const directory = mkdtempSync(join(tmpdir(), "loopstack-graph-"));
  const path = join(directory, "graph.yaml");
  writeFileSync(path, contents);
  return path;
}

describe("graph commands", () => {
  it("validates and inspects a portable graph", () => {
    const path = yamlFile(JSON.stringify(portableGraph));
    expect(validateGraphFile(path)).toMatchObject({ valid: true, warnings: [] });
    expect(inspectGraphFile(path)).toMatchObject({
      valid: true,
      id: "seo-graph",
      executionMode: "single-agent-multi-session",
      entrypoint: "research",
      nodeCount: 3,
      edgeCount: 2,
      agents: [{ id: "seo-operator", profile: "ecoi-seo", sessionPolicy: "fresh" }],
    });
  });

  it("returns compiler errors without hiding their codes", () => {
    const invalid = { ...portableGraph, entrypoint: "missing" };
    expect(validateGraphFile(yamlFile(JSON.stringify(invalid)))).toMatchObject({
      valid: false,
      errors: expect.arrayContaining([expect.objectContaining({ code: "UNKNOWN_ENTRYPOINT" })]),
    });
  });
});
