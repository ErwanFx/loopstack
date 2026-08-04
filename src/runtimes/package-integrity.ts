import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { join, relative } from "node:path";
import type { RuntimeName } from "./types.js";

export type PackageIntegrityManifest = {
  schemaVersion: 1;
  runtime: RuntimeName;
  loopId: string;
  version: number;
  files: Record<string, string>;
};

function sha256(content: string | Buffer): string {
  return createHash("sha256").update(content).digest("hex");
}

export function packageManifestDigest(content: string | Buffer): string {
  return sha256(content);
}

export function addPackageIntegrityManifest(
  runtime: RuntimeName,
  loopId: string,
  version: number,
  files: Record<string, string>,
): Record<string, string> {
  const manifest: PackageIntegrityManifest = {
    schemaVersion: 1,
    runtime,
    loopId,
    version,
    files: Object.fromEntries(Object.entries(files).sort(([a], [b]) => a.localeCompare(b)).map(([name, content]) => [name, sha256(content)])),
  };
  return { ...files, "package-manifest.json": `${JSON.stringify(manifest, null, 2)}\n` };
}

async function packageFiles(root: string, directory = root): Promise<string[]> {
  const names: string[] = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) names.push(...await packageFiles(root, path));
    else if (entry.isFile()) names.push(relative(root, path).replaceAll("\\", "/"));
  }
  return names;
}

export async function validatePackageIntegrity(
  packagePath: string,
  expectedRuntime: RuntimeName,
): Promise<{ manifest: PackageIntegrityManifest | null; errors: string[] }> {
  const errors: string[] = [];
  let manifest: PackageIntegrityManifest;
  try {
    manifest = JSON.parse(await readFile(join(packagePath, "package-manifest.json"), "utf8")) as PackageIntegrityManifest;
  } catch (error) {
    return { manifest: null, errors: [error instanceof Error ? error.message : String(error)] };
  }
  if (manifest.schemaVersion !== 1) errors.push("package manifest schemaVersion must be 1");
  if (manifest.runtime !== expectedRuntime) errors.push(`package manifest runtime must be ${expectedRuntime}`);
  if (typeof manifest.loopId !== "string" || manifest.loopId.length === 0) errors.push("package manifest loopId must be a non-empty string");
  if (!Number.isInteger(manifest.version) || manifest.version < 0) errors.push("package manifest version must be a non-negative integer");
  if (manifest.files === null || typeof manifest.files !== "object" || Array.isArray(manifest.files)) {
    errors.push("package manifest files must be an object");
    return { manifest, errors };
  }
  const actual = (await packageFiles(packagePath)).filter((name) => name !== "package-manifest.json").sort();
  const declared = Object.keys(manifest.files).sort();
  if (JSON.stringify(actual) !== JSON.stringify(declared)) errors.push("package manifest must declare the exact package file set");
  for (const name of declared) {
    try {
      const digest = sha256(await readFile(join(packagePath, name)));
      if (manifest.files[name] !== digest) errors.push(`package file digest mismatch: ${name}`);
    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error));
    }
  }
  return { manifest, errors };
}

/** Authorization is deliberately separate from self-consistency validation. */
export async function authorizeRuntimePackage(
  packagePath: string,
  expectedRuntime: RuntimeName,
  expectedManifestDigest: string,
): Promise<{ authorized: boolean; selfConsistent: boolean; manifestDigest: string | null; errors: string[] }> {
  const integrity = await validatePackageIntegrity(packagePath, expectedRuntime);
  if (integrity.manifest === null || integrity.errors.length > 0) {
    return { authorized: false, selfConsistent: false, manifestDigest: null, errors: integrity.errors };
  }
  const manifestDigest = packageManifestDigest(await readFile(join(packagePath, "package-manifest.json")));
  const digestAccepted = /^[a-f0-9]{64}$/.test(expectedManifestDigest) && manifestDigest === expectedManifestDigest;
  return {
    authorized: digestAccepted,
    selfConsistent: true,
    manifestDigest,
    errors: digestAccepted ? [] : ["package manifest digest does not match externally supplied expected digest"],
  };
}
