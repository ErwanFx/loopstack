import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { z } from "zod";

const allowedFiles = [
  ".gitignore", "generated/.gitkeep", "loops/.gitkeep", "registry.yaml", "tests/.gitkeep",
] as const;
const templatesRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../templates/business-loops");

export class BusinessRepoInitError extends Error {
  constructor(readonly code: "TARGET_NOT_EMPTY" | "HOST_RESOLVER_REQUIRED" | "GIT_INIT_FAILED") {
    super(code);
    this.name = "BusinessRepoInitError";
  }
}

export interface OverwriteTrustResolver {
  authorizeAndConsume(request: OverwriteTrustRequest): boolean;
}

export type OverwriteAuthorization = {
  evidenceId: string;
  planId: string;
  planHash: string;
  contentHash: string;
};

export type OverwriteTrustRequest = OverwriteAuthorization & {
  action: "overwrite-business-repo";
  target: string;
  now: Date;
};

export type OverwriteTrustRecord = Omit<OverwriteTrustRequest, "now"> & {
  issuedAt: string;
  expiresAt: string;
  nonce: string;
};

const OverwriteAuthorizationSchema = z.object({
  evidenceId: z.string().min(1),
  planId: z.string().min(1),
  planHash: z.string().regex(/^[a-f0-9]{64}$/),
  contentHash: z.string().regex(/^[a-f0-9]{64}$/),
}).strict();

const BusinessRepoInitOptionsSchema = z.object({
  initializeGit: z.boolean(),
  force: z.boolean(),
  overwriteAuthorization: OverwriteAuthorizationSchema.optional(),
}).strict();

export type BusinessRepoInitOptions = z.infer<typeof BusinessRepoInitOptionsSchema>;

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function generatedContentHash(): string {
  return sha256(JSON.stringify(allowedFiles.map((relative) => {
    const source = relative === ".gitignore" ? "gitignore.template" : relative;
    return [relative, readFileSync(join(templatesRoot, source), "utf8")];
  })));
}

function overwritePlanHash(target: string, planId: string, contentHash: string): string {
  return sha256(JSON.stringify({
    action: "overwrite-business-repo",
    target: resolve(target),
    planId,
    contentHash,
  }));
}

export function createBusinessRepoOverwriteContext(
  target: string,
  evidenceId: string,
  planId: string,
): OverwriteAuthorization {
  const contentHash = generatedContentHash();
  const planHash = overwritePlanHash(target, planId, contentHash);
  return OverwriteAuthorizationSchema.parse({ evidenceId, planId, planHash, contentHash });
}

/** Deterministic consuming resolver for trusted hosts and regression tests. */
export class InMemoryOverwriteTrustResolver implements OverwriteTrustResolver {
  readonly #records: ReadonlyMap<string, OverwriteTrustRecord>;
  readonly #consumedNonces = new Set<string>();

  constructor(records: readonly OverwriteTrustRecord[]) {
    this.#records = new Map(records.map((record) => [record.evidenceId, structuredClone(record)]));
  }

  authorizeAndConsume(request: OverwriteTrustRequest): boolean {
    const record = this.#records.get(request.evidenceId);
    const issuedAt = Date.parse(record?.issuedAt ?? "");
    const expiresAt = Date.parse(record?.expiresAt ?? "");
    const now = request.now.getTime();
    if (!record || record.action !== request.action || resolve(record.target) !== request.target
      || record.planId !== request.planId || record.planHash !== request.planHash
      || record.contentHash !== request.contentHash || !Number.isFinite(now)
      || !Number.isFinite(issuedAt) || !Number.isFinite(expiresAt)
      || issuedAt >= expiresAt || issuedAt > now || expiresAt <= now
      || !record.nonce || this.#consumedNonces.has(record.nonce)) return false;
    this.#consumedNonces.add(record.nonce);
    return true;
  }
}

export function initBusinessRepo(
  target: string,
  options: BusinessRepoInitOptions,
  trustResolver?: OverwriteTrustResolver,
  now = new Date(),
) {
  const nonEmpty = existsSync(target) && readdirSync(target).length > 0;
  const parsedOptions = BusinessRepoInitOptionsSchema.safeParse(options);
  const force = parsedOptions.success ? parsedOptions.data.force : Boolean((options as { force?: unknown }).force);
  if (nonEmpty && !force) throw new BusinessRepoInitError("TARGET_NOT_EMPTY");
  if (nonEmpty && force) {
    const authorization = parsedOptions.success ? parsedOptions.data.overwriteAuthorization : undefined;
    const contentHash = generatedContentHash();
    const planHash = authorization === undefined
      ? ""
      : overwritePlanHash(target, authorization.planId, contentHash);
    if (!authorization || authorization.contentHash !== contentHash || authorization.planHash !== planHash
      || !trustResolver?.authorizeAndConsume({
      evidenceId: authorization.evidenceId,
      action: "overwrite-business-repo",
      target: resolve(target),
      planId: authorization.planId,
      planHash,
      contentHash,
      now,
    })) throw new BusinessRepoInitError("HOST_RESOLVER_REQUIRED");
  }
  for (const relative of allowedFiles) {
    const destination = join(target, relative);
    mkdirSync(dirname(destination), { recursive: true });
    const source = relative === ".gitignore" ? "gitignore.template" : relative;
    copyFileSync(join(templatesRoot, source), destination);
  }
  const initializeGit = parsedOptions.success && parsedOptions.data.initializeGit;
  if (initializeGit) {
    const result = spawnSync("git", ["init"], { cwd: target, encoding: "utf8" });
    if (result.status !== 0) throw new BusinessRepoInitError("GIT_INIT_FAILED");
  }
  return { target, created: [...allowedFiles].sort(), gitInitialized: initializeGit };
}

export function runInitBusinessRepoCommand(args: readonly string[]): number {
  const target = args[0];
  if (!target) return 2;
  try {
    const result = initBusinessRepo(target, {
      initializeGit: args.includes("--git"),
      force: args.includes("--force"),
    });
    console.log(JSON.stringify(result, null, 2));
    return 0;
  } catch (error) {
    const code = error instanceof BusinessRepoInitError ? error.code : "BUSINESS_REPO_INIT_FAILED";
    console.error(JSON.stringify({
      code,
      ...(code === "HOST_RESOLVER_REQUIRED"
        ? { message: "Standalone --force cannot authorize overwrite; use the host API with an injected consuming resolver" }
        : {}),
    }));
    return 2;
  }
}
