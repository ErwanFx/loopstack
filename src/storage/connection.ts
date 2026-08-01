import { NativeCapabilitySchema, type NativeCapability } from "./capabilities.js";

export type ConnectionReport = {
  status: "ready" | "blocked";
  provider: NativeCapability["provider"];
  runtime: NativeCapability["runtime"];
  capability: NativeCapability["capability"];
  blockers: string[];
  checkedAt: string;
};

const credentialPattern = /\b(?:api[_-]?key|access[_-]?token|token|secret|password)\s*[:=]\s*\S+/i;

export function evaluateNativeConnection(input: unknown): ConnectionReport {
  const capability = NativeCapabilitySchema.parse(input);
  const blockers: string[] = [];
  if (!capability.authenticated) blockers.push("authentication");
  if (!capability.permissions.read) blockers.push("read_permission");
  if (!capability.permissions.schemaWrite) blockers.push("schema_write_permission");
  if (!capability.alertChannelTested) blockers.push("tested_alert_channel");
  if (credentialPattern.test(capability.evidence)) blockers.push("credential_exposure");

  return {
    status: blockers.length === 0 ? "ready" : "blocked",
    provider: capability.provider,
    runtime: capability.runtime,
    capability: capability.capability,
    blockers,
    checkedAt: capability.checkedAt,
  };
}
