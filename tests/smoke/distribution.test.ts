import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parse } from "yaml";

const version = "0.4.0";

describe("public plugin distribution", () => {
  it("publishes root-source marketplaces for Codex and Claude Code", () => {
    const codex = JSON.parse(readFileSync(".agents/plugins/marketplace.json", "utf8"));
    expect(codex.name).toBe("loopstack");
    expect(codex.plugins).toEqual(expect.arrayContaining([
      expect.objectContaining({
        name: "loopstack",
        source: { source: "local", path: "." },
      }),
    ]));

    const claude = JSON.parse(readFileSync(".claude-plugin/marketplace.json", "utf8"));
    expect(claude.name).toBe("loopstack");
    expect(claude.plugins).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: "loopstack", source: "./", version }),
    ]));
  });

  it("keeps every release manifest on the same version", () => {
    expect(JSON.parse(readFileSync(".codex-plugin/plugin.json", "utf8")).version).toBe(version);
    expect(JSON.parse(readFileSync(".claude-plugin/plugin.json", "utf8")).version).toBe(version);
    expect(JSON.parse(readFileSync(".claude-plugin/marketplace.json", "utf8")).metadata.version).toBe(version);
    expect(JSON.parse(readFileSync(".claude-plugin/marketplace.json", "utf8")).plugins[0].version).toBe(version);
    expect(parse(readFileSync("plugin.yaml", "utf8")).version).toBe(version);
    expect(JSON.parse(readFileSync("package.json", "utf8")).version).toBe(version);
  });

  it("ships an MIT license and exact multi-runtime operating instructions", () => {
    const license = readFileSync("LICENSE", "utf8");
    expect(license).toContain("Permission is hereby granted, free of charge");

    const readme = readFileSync("README.md", "utf8");
    for (const command of [
      "codex plugin marketplace add ErwanFx/loopstack",
      "codex plugin add loopstack@loopstack",
      "codex plugin marketplace upgrade loopstack",
      "claude plugin marketplace add ErwanFx/loopstack",
      "claude plugin install loopstack@loopstack",
      "claude plugin update loopstack@loopstack",
      "hermes plugins install ErwanFx/loopstack --enable",
      "hermes plugins update loopstack",
      "`$loopstack:using-loopstack`",
      "`/loopstack:using-loopstack`",
      "`loopstack:using-loopstack`",
    ]) expect(readme).toContain(command);
    expect(readme).toMatch(/Node\.js.*pnpm/is);
    expect(readme).toMatch(/architecture-diagram.*optional/is);
    expect(readme).toMatch(/Hermes.*Claude Code.*Codex/is);
    expect(readme).toContain("Installing Loopstack installs the framework");
    expect(readme).toContain("mutable domain skills");
    expect(readme).toContain("loop store");
    expect(readme).toContain("graph engineering is optional");
    expect(readme).toContain("single-agent-multi-session");
    expect(readme).toContain("examples/seo/graph.yaml");
  });
});
