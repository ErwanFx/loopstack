import { writeFileSync } from "node:fs";
import { createStorageBlueprint } from "../storage/blueprints.js";
import { createProvisioningPlan, ProvisioningModeSchema, type ProvisioningMode } from "../storage/provisioning.js";
import { StorageProviderSchema, type StorageProvider } from "../storage/schema.js";

export function generateStoragePlan(provider: StorageProvider, loopId: string, environment: string, expiresAt: string, mode: ProvisioningMode) {
  return createProvisioningPlan(createStorageBlueprint(provider, loopId), environment, expiresAt, mode);
}

function option(args: readonly string[], name: string): string | undefined {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
}

export function runStoragePlanCommand(args: readonly string[]): number {
  const provider = StorageProviderSchema.safeParse(option(args, "--provider"));
  const loopId = option(args, "--loop-id");
  const environment = option(args, "--environment");
  const expiresAt = option(args, "--expires-at");
  const mode = ProvisioningModeSchema.safeParse(option(args, "--mode"));
  const output = option(args, "--out");
  if (!provider.success || !loopId || !environment || !expiresAt || !mode.success || !output) {
    console.error(JSON.stringify({ code: "INVALID_ARGUMENT", message: "Provide --provider, --loop-id, --environment, --expires-at, --mode bootstrap|schema, and --out" }));
    return 2;
  }
  try {
    const plan = generateStoragePlan(provider.data, loopId, environment, expiresAt, mode.data);
    writeFileSync(output, `${JSON.stringify(plan, null, 2)}\n`);
    console.log(JSON.stringify({ status: "planned", provider: provider.data, loopId, output }));
    return 0;
  } catch (error) {
    console.error(JSON.stringify({ code: "STORAGE_PLAN_FAILED", message: error instanceof Error ? error.message : String(error) }));
    return 2;
  }
}
