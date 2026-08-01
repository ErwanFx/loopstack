import { readFileSync } from "node:fs";
import { ProvisioningPlanSchema, verifyProvisioningEvidence } from "../storage/provisioning.js";

export function verifyStorageFiles(planPath: string, evidencePath: string) {
  const plan = ProvisioningPlanSchema.parse(JSON.parse(readFileSync(planPath, "utf8")));
  const evidence = JSON.parse(readFileSync(evidencePath, "utf8")) as unknown;
  return verifyProvisioningEvidence(plan, evidence);
}

function option(args: readonly string[], name: string): string | undefined {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
}

export function runStorageVerifyCommand(args: readonly string[]): number {
  const plan = option(args, "--plan");
  const evidence = option(args, "--evidence");
  if (!plan || !evidence) {
    console.error(JSON.stringify({ code: "INVALID_ARGUMENT", message: "Provide --plan and --evidence" }));
    return 2;
  }
  try {
    const report = verifyStorageFiles(plan, evidence);
    console.log(JSON.stringify(report, null, 2));
    return report.status === "verified" ? 0 : 2;
  } catch (error) {
    console.error(JSON.stringify({ code: "STORAGE_VERIFY_FAILED", message: error instanceof Error ? error.message : String(error) }));
    return 2;
  }
}
