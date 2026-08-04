import { readdirSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";

const publicSkills = [
  "loop-build",
  "loop-design",
  "loop-discover",
  "loop-launch",
  "loop-operate",
  "loop-plan",
  "using-loopstack",
];

describe("plugin manifests", () => {
  it("matches the repository and exposes only consolidated top-level skills", () => {
    const manifest = JSON.parse(readFileSync(".codex-plugin/plugin.json", "utf8"));
    expect(manifest.name).toBe("loopstack");
    expect(manifest.version).toBe("0.2.0");
    expect(manifest.skills).toBe("./skills/");
    const discovered = readdirSync("skills", { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .filter((entry) => {
        try {
          readFileSync(`skills/${entry.name}/SKILL.md`, "utf8");
          return true;
        } catch {
          return false;
        }
      })
      .map((entry) => entry.name)
      .sort();
    expect(discovered).toEqual(publicSkills);
  });

  it("keeps Hermes and Claude manifests on version 0.2.0", () => {
    const hermes = readFileSync("plugin.yaml", "utf8");
    const claude = JSON.parse(readFileSync(".claude-plugin/plugin.json", "utf8"));
    expect(hermes).toContain("version: 0.2.0");
    expect(claude.version).toBe("0.2.0");
  });

  it("registers public skills and executable legacy aliases separately", () => {
    const script = [
      "import importlib.util,json,pathlib",
      "s=importlib.util.spec_from_file_location('loopstack_plugin',pathlib.Path('__init__.py'))",
      "m=importlib.util.module_from_spec(s);s.loader.exec_module(m)",
      "class C:",
      " def __init__(self): self.skills=[]",
      " def register_skill(self,n,p,d): self.skills.append({'name':n,'path':str(p),'description':d})",
      "c=C();m.register(c)",
      "print(json.dumps({'skills':c.skills,'resolved':m.resolve_skill_name('loop-eric-review')}))",
    ].join("\n");
    const result = spawnSync("python3", ["-c", script], { encoding: "utf8" });
    expect(result.status, result.stderr).toBe(0);
    const registration = JSON.parse(result.stdout);
    const names = registration.skills.map((skill: { name: string }) => skill.name);
    expect(names.filter((name: string) => publicSkills.includes(name)).sort()).toEqual(publicSkills);
    expect(names).toContain("loop-eric-review");
    expect(names).toContain("loop-storage-setup");
    const legacy = registration.skills.find((skill: { name: string }) => skill.name === "loop-eric-review");
    expect(legacy.path).toMatch(/skills\/loop-design\/SKILL\.md$/);
    expect(legacy.description).toMatch(/qualified AI Loop/i);
    expect(registration.resolved).toBe("loop-design");
  });
});
