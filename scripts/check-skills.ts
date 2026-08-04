import { readdirSync, readFileSync } from "node:fs";
import { parse } from "yaml";

const publicSkills = [
  "loop-build",
  "loop-design",
  "loop-discover",
  "loop-launch",
  "loop-operate",
  "loop-plan",
  "using-loopstack",
] as const;

const allowedFrontmatterKeys = ["description", "name"];

function frontmatter(path: string): Record<string, unknown> {
  const content = readFileSync(path, "utf8");
  const match = content.match(/^---\s*\n([\s\S]*?)\n---(?:\s*\n|$)/);
  if (!match) throw new Error(`${path}: missing YAML frontmatter`);
  const value = parse(match[1]);
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${path}: frontmatter must be a mapping`);
  }
  return value as Record<string, unknown>;
}

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

if (JSON.stringify(discovered) !== JSON.stringify([...publicSkills].sort())) {
  throw new Error(`Public skill surface changed: ${discovered.join(", ")}`);
}

for (const name of publicSkills) {
  const path = `skills/${name}/SKILL.md`;
  const metadata = frontmatter(path);
  const keys = Object.keys(metadata).sort();
  if (JSON.stringify(keys) !== JSON.stringify(allowedFrontmatterKeys)) {
    throw new Error(`${path}: frontmatter keys must be exactly name and description`);
  }
  if (metadata.name !== name) throw new Error(`${path}: name must equal ${name}`);
  if (typeof metadata.description !== "string" || metadata.description.trim().length === 0) {
    throw new Error(`${path}: description must be a non-empty string`);
  }
}

console.log(`Validated ${publicSkills.length} portable public skills.`);
