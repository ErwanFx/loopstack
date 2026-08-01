import { alertsGate } from "./gates/alerts.js";
import { approvalsGate } from "./gates/approvals.js";
import { connectionsGate } from "./gates/connections.js";
import { binaryGate } from "./gates/gate.js";
import { idempotencyGate } from "./gates/idempotency.js";
import { scenariosGate } from "./gates/scenarios.js";
import { staticGate } from "./gates/static.js";
import { storageContractGate } from "./gates/storage-contract.js";
import type { QaGateResult, QaReport } from "./types.js";

export type QaInput = {
  manifest: "valid" | "invalid";
  connections: "verified" | "missing";
  storageContract: "verified" | "invalid";
  scenarios: "pass" | "fail";
  approvals: "pass" | "fail";
  idempotency: "pass" | "fail";
  alerts: "pass" | "fail";
  canary: "pass" | "fail";
};

export async function runQa(input: QaInput): Promise<QaReport> {
  const candidates: Array<() => QaGateResult> = [
    () => staticGate(input.manifest),
    () => connectionsGate(input.connections),
    () => storageContractGate(input.storageContract),
    () => scenariosGate(input.scenarios),
    () => approvalsGate(input.approvals),
    () => idempotencyGate(input.idempotency),
    () => alertsGate(input.alerts),
    () => binaryGate("canary", input.canary === "pass", "CANARY_FAILED", "canary simulation"),
  ];
  const gates: QaGateResult[] = [];
  for (const candidate of candidates) {
    const result = candidate();
    gates.push(result);
    if (result.blocking && result.status === "fail") break;
  }
  const blockers = gates.flatMap((gate) => gate.blocking ? gate.findings : []);
  const verdict = blockers.length === 0 ? "pass" as const : "blocked" as const;
  return {
    verdict,
    gates,
    blockers,
    markdown: `# Loopstack QA\n\nQA verdict: ${verdict}\n\n${gates.map((gate) => `- ${gate.name}: ${gate.status}`).join("\n")}\n`,
  };
}
