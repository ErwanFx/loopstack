import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

const ignoredDirectories = new Set([".git", "dist", "node_modules"]);

function markdownFiles(root: string): string[] {
  return readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    if (entry.isDirectory() && ignoredDirectories.has(entry.name)) return [];
    const path = `${root}/${entry.name}`;
    if (entry.isDirectory()) return markdownFiles(path);
    return entry.isFile() && entry.name.endsWith(".md") ? [path] : [];
  });
}

const broken: string[] = [];
for (const file of markdownFiles(".")) {
  const content = readFileSync(file, "utf8");
  for (const match of content.matchAll(/\]\(([^)]+)\)/g)) {
    let target = match[1]!.trim();
    if (/^(?:https?:\/\/|mailto:|#)/.test(target)) continue;
    target = target.split("#", 1)[0]!;
    if (target.startsWith("<") && target.endsWith(">")) target = target.slice(1, -1);
    try {
      target = decodeURIComponent(target);
    } catch {
      broken.push(`${file}: invalid URL encoding in ${target}`);
      continue;
    }
    if (target && !existsSync(resolve(dirname(file), target))) broken.push(`${file} -> ${target}`);
  }
}

if (broken.length > 0) throw new Error(`Broken local Markdown links:\n${broken.join("\n")}`);
console.log("Local Markdown links resolve.");
