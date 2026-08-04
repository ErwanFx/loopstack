import { readFile } from "node:fs/promises";
import type { RuntimeName, RuntimeValidation } from "./types.js";
import { generatedLoopSkillName } from "./render-helpers.js";

const strictSemver = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/;
const loopIdPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

async function jsonFile(path: string): Promise<Record<string, unknown>> {
  const parsed = record(JSON.parse(await readFile(path, "utf8")));
  if (parsed === null) throw new Error(`${path} must contain a JSON object`);
  return parsed;
}

function requireString(value: unknown, field: string, errors: string[]): void {
  if (typeof value !== "string" || value.trim().length === 0) errors.push(`${field} must be a non-empty string`);
}

function validateCommonManifest(manifest: Record<string, unknown>, errors: string[]): void {
  requireString(manifest.name, "plugin.name", errors);
  requireString(manifest.description, "plugin.description", errors);
  if (typeof manifest.version !== "string" || !strictSemver.test(manifest.version)) {
    errors.push("plugin.version must be strict semver");
  }
  const author = record(manifest.author);
  if (author === null) errors.push("plugin.author must be an object");
  else requireString(author.name, "plugin.author.name", errors);
}

export async function validateRuntimePackage(
  packagePath: string,
  runtime: Extract<RuntimeName, "claude-code" | "codex">,
): Promise<RuntimeValidation> {
  const errors: string[] = [];
  try {
    const runtimeManifest = await jsonFile(`${packagePath}/runtime.json`);
    const loopId = runtimeManifest.loopId;
    if (typeof loopId !== "string" || !loopIdPattern.test(loopId)) {
      errors.push("runtime.loopId must be a kebab-case loop id");
      return { valid: false, errors };
    }

    const manifestPath = runtime === "claude-code"
      ? `${packagePath}/.claude-plugin/plugin.json`
      : `${packagePath}/.codex-plugin/plugin.json`;
    const manifest = await jsonFile(manifestPath);
    validateCommonManifest(manifest, errors);
    if (manifest.name !== `loopstack-${loopId}`) errors.push("plugin.name must match the runtime loop id");

    if (runtime === "codex") {
      if (manifest.skills !== "./skills/") errors.push("plugin.skills must be ./skills/");
      const ui = record(manifest.interface);
      if (ui === null) errors.push("plugin.interface must be an object");
      else {
        for (const field of ["displayName", "shortDescription", "longDescription", "developerName", "category"]) {
          requireString(ui[field], `plugin.interface.${field}`, errors);
        }
        if (!Array.isArray(ui.capabilities)) errors.push("plugin.interface.capabilities must be an array");
        if (!Array.isArray(ui.defaultPrompt) || ui.defaultPrompt.length === 0) {
          errors.push("plugin.interface.defaultPrompt must be a non-empty array");
        }
      }
    }

    const wrapperName = generatedLoopSkillName(loopId);
    const skillPath = `${packagePath}/skills/${wrapperName}/SKILL.md`;
    const skill = await readFile(skillPath, "utf8");
    if (!skill.startsWith("---\n") || !skill.includes(`\nname: ${wrapperName}\n`)) {
      errors.push(`skills/${wrapperName}/SKILL.md must declare the generated loop skill`);
    }
  } catch (error) {
    errors.push(error instanceof Error ? error.message : String(error));
  }
  return { valid: errors.length === 0, errors };
}
