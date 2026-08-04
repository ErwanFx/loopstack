import { alertsGate } from "./gates/alerts.js";
import { approvalsGate } from "./gates/approvals.js";
import { connectionsGate } from "./gates/connections.js";
import { binaryGate } from "./gates/gate.js";
import { idempotencyGate } from "./gates/idempotency.js";
import { scenariosGate } from "./gates/scenarios.js";
import { staticGate } from "./gates/static.js";
import { storageContractGate } from "./gates/storage-contract.js";
import type { QaGateResult, QaReport } from "./types.js";
import { z } from "zod";

const QaGateNameSchema = z.enum([
  "static", "connections", "storage-contract", "scenarios", "approvals", "idempotency", "alerts", "canary",
]);
export type QaGateName = z.infer<typeof QaGateNameSchema>;

export const QaInputSchema = z.object({
  manifest: z.enum(["valid", "invalid"]),
  connections: z.enum(["verified", "missing"]),
  storageContract: z.enum(["verified", "invalid"]),
  scenarios: z.enum(["pass", "fail"]),
  approvals: z.enum(["pass", "fail"]),
  idempotency: z.enum(["pass", "fail"]),
  alerts: z.enum(["pass", "fail"]),
  canary: z.enum(["pass", "fail"]),
  loopId: z.string().min(1),
  scopeHash: z.string().regex(/^[a-f0-9]{64}$/),
  artifactHash: z.string().regex(/^[a-f0-9]{64}$/),
  evidenceIds: z.record(QaGateNameSchema, z.string().min(1)),
}).strict();

export type QaInput = z.infer<typeof QaInputSchema>;

export type QaTrustRecord = {
  evidenceId: string;
  loopId: string;
  scopeHash: string;
  artifactHash: string;
  gate: string;
  status: "pass" | "fail";
  issuedAt: string;
  expiresAt: string;
  nonce: string;
};

export type QaTrustRequirement = {
  evidenceId: string;
  loopId: string;
  scopeHash: string;
  artifactHash: string;
  gate: QaGateName;
  now: Date;
};

/** Host-owned boundary. Implementations must validate and consume all requirements atomically. */
export interface QaTrustRegistry {
  authorizeAndConsume(requirements: readonly QaTrustRequirement[]): boolean | Promise<boolean>;
}

/** Deterministic registry for trusted hosts and tests; records never come from QaInput. */
export class InMemoryQaTrustRegistry implements QaTrustRegistry {
  readonly #records: ReadonlyMap<string, QaTrustRecord>;
  readonly #consumedNonces = new Set<string>();

  constructor(records: readonly QaTrustRecord[]) {
    this.#records = new Map(records.map((record) => [record.evidenceId, structuredClone(record)]));
  }

  authorizeAndConsume(requirements: readonly QaTrustRequirement[]): boolean {
    const records: QaTrustRecord[] = [];
    const batchNonces = new Set<string>();
    for (const requirement of requirements) {
      const record = this.#records.get(requirement.evidenceId);
      const issuedAt = Date.parse(record?.issuedAt ?? "");
      const expiresAt = Date.parse(record?.expiresAt ?? "");
      const now = requirement.now.getTime();
      if (!record || record.status !== "pass" || record.loopId !== requirement.loopId
        || record.scopeHash !== requirement.scopeHash || record.artifactHash !== requirement.artifactHash
        || record.gate !== requirement.gate || !Number.isFinite(now)
        || !Number.isFinite(issuedAt) || !Number.isFinite(expiresAt)
        || issuedAt >= expiresAt || issuedAt > now || expiresAt <= now
        || !record.nonce || this.#consumedNonces.has(record.nonce) || batchNonces.has(record.nonce)) return false;
      records.push(record);
      batchNonces.add(record.nonce);
    }
    for (const record of records) this.#consumedNonces.add(record.nonce);
    return true;
  }
}

export async function runQa(
  input: QaInput,
  trustRegistry?: QaTrustRegistry,
  now = new Date(),
): Promise<QaReport> {
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
  const authoritative = trustRegistry !== undefined;
  if (blockers.length === 0) {
    if (!trustRegistry) {
      blockers.push({
        code: "EXTERNAL_TRUST_REGISTRY_REQUIRED",
        message: "Structural QA input is non-authoritative until a host-owned trust registry resolves opaque evidence IDs",
      });
    } else {
      const requirements = gates.map((gate) => ({
        evidenceId: input.evidenceIds[gate.name as QaGateName] ?? "",
        loopId: input.loopId,
        scopeHash: input.scopeHash,
        artifactHash: input.artifactHash,
        gate: gate.name as QaGateName,
        now,
      }));
      if (!await trustRegistry.authorizeAndConsume(requirements)) blockers.push({
        code: "TRUSTED_QA_EVIDENCE_REJECTED",
        message: "Host registry rejected or already consumed the exact QA evidence set",
      });
    }
  }
  const verdict = blockers.length === 0 ? "pass" as const : "blocked" as const;
  return {
    verdict,
    authoritative,
    gates,
    blockers,
    markdown: `# Loopstack QA\n\nQA verdict: ${verdict}\nAuthoritative: ${authoritative ? "yes" : "no"}\n\n${gates.map((gate) => `- ${gate.name}: ${gate.status}`).join("\n")}\n`,
  };
}
