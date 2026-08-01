import { copyFileSync, existsSync, mkdirSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { spawnSync } from "node:child_process";

const allowedFiles = [
  ".gitignore",
  "generated/.gitkeep",
  "loops/.gitkeep",
  "registry.yaml",
  "tests/.gitkeep",
] as const;

export class BusinessRepoInitError extends Error {
  constructor(readonly code: "TARGET_NOT_EMPTY" | "PLAN_APPROVAL_REQUIRED" | "GIT_INIT_FAILED") {
    super(code);
    this.name = "BusinessRepoInitError";
  }
}

export function initBusinessRepo(
  target: string,
  options: { initializeGit: boolean; force: boolean; approvedOverwrite: boolean },
) {
  const nonEmpty = existsSync(target) && readdirSync(target).length > 0;
  if (nonEmpty && !options.force) throw new BusinessRepoInitError("TARGET_NOT_EMPTY");
  if (nonEmpty && options.force && !options.approvedOverwrite) throw new BusinessRepoInitError("PLAN_APPROVAL_REQUIRED");
  for (const relative of allowedFiles) {
    const destination = join(target, relative);
    mkdirSync(dirname(destination), { recursive: true });
    copyFileSync(join("templates/business-loops", relative), destination);
  }
  if (options.initializeGit) {
    const result = spawnSync("git", ["init"], { cwd: target, encoding: "utf8" });
    if (result.status !== 0) throw new BusinessRepoInitError("GIT_INIT_FAILED");
  }
  return { target, created: [...allowedFiles].sort(), gitInitialized: options.initializeGit };
}

export function runInitBusinessRepoCommand(args: readonly string[]): number {
  const target = args[0];
  if (!target) return 2;
  try {
    const result = initBusinessRepo(target, {
      initializeGit: args.includes("--git"),
      force: args.includes("--force"),
      approvedOverwrite: false,
    });
    console.log(JSON.stringify(result, null, 2));
    return 0;
  } catch (error) {
    console.error(JSON.stringify({ code: error instanceof BusinessRepoInitError ? error.code : "BUSINESS_REPO_INIT_FAILED" }));
    return 2;
  }
}
