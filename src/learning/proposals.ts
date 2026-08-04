import { createHash } from "node:crypto";
import { realpath } from "node:fs/promises";
import { isAbsolute, relative, resolve, sep } from "node:path";
import { z } from "zod";
import { LoopIdSchema } from "../domain/ids.js";

export const LearningProposalStatusSchema = z.enum([
  "proposed", "validated", "approved", "promoted", "rejected", "rolled-back",
]);

function isReadonlyPluginTarget(target: string): boolean {
  const normalized = target.replaceAll("\\", "/").toLowerCase();
  return normalized.startsWith("loopstack:")
    || /(^|\/)plugins?(?:\/[^/]+)*\/skills\//.test(normalized)
    || normalized.includes("/.codex/plugins/cache/");
}

function isSafeRelativeTarget(target: string): boolean {
  const normalized = target.replaceAll("\\", "/");
  if (normalized.startsWith("/") || /^[a-zA-Z]:\//.test(normalized)) return false;
  return normalized.split("/").every((part) => part.length > 0 && part !== "." && part !== "..");
}

function isSensitiveTarget(target: string): boolean {
  const parts = target.replaceAll("\\", "/").toLowerCase().split("/");
  const basename = parts.at(-1) ?? "";
  return basename === ".env" || basename.startsWith(".env.") || basename === "package.json"
    || /^(?:id_(?:rsa|dsa|ecdsa|ed25519)|.*\.(?:pem|key|p12|pfx))$/.test(basename)
    || parts.some((part) => part === ".ssh");
}

export const LearningProposalSchema = z.object({
  id: LoopIdSchema,
  loopId: LoopIdSchema,
  status: LearningProposalStatusSchema,
  evidenceIds: z.array(z.string().min(1)).min(1),
  feedbackWindowIds: z.array(z.string().min(1)).default([]),
  targetArtifact: z.string().min(1)
    .refine((target) => !isReadonlyPluginTarget(target), "Plugin-provided skills are read-only learning targets")
    .refine(isSafeRelativeTarget, "Learning target must be a safe relative target path")
    .refine((target) => !isSensitiveTarget(target), "Sensitive files are forbidden learning targets"),
  proposedPatchSummary: z.string().min(1),
  expectedMetric: z.string().min(1),
  expectedMetricEffect: z.string().min(1),
  risk: z.enum(["low", "medium", "high"]),
  testCommand: z.string().min(1),
  rollbackInstructions: z.string().min(1),
  tests: z.object({
    status: z.enum(["pending", "passed", "failed"]),
    evidenceId: z.string().min(1).optional(),
  }),
  approvedBy: z.string().min(1).optional(),
});

const LearningProposalEventInputSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("validate"), occurredAt: z.iso.datetime() }),
  z.object({ type: z.literal("approve"), actor: z.string().min(1).optional(), occurredAt: z.iso.datetime() }),
  z.object({ type: z.literal("promote"), occurredAt: z.string() }),
  z.object({ type: z.literal("reject"), actor: z.string().min(1), reason: z.string().min(1), occurredAt: z.iso.datetime() }),
  z.object({ type: z.literal("rollback"), actor: z.string().min(1), occurredAt: z.iso.datetime() }),
]);

export type LearningProposal = z.infer<typeof LearningProposalSchema>;
export type LearningProposalEventInput = z.infer<typeof LearningProposalEventInputSchema>;

export interface LearningPromotionCapability {
  id: string;
  proposalId: string;
  proposalHash: string;
  loopId: string;
  risk: LearningProposal["risk"];
  targetArtifact: string;
  evidenceIds: readonly string[];
  feedbackWindowIds: readonly string[];
  testEvidenceId: string;
  approvedBy: string;
  issuedAt: string;
  expiresAt: string;
}

export interface LearningPromotionCapabilityResolver {
  consume(id: string, expectedEnvelope: Omit<LearningPromotionCapability, "id" | "issuedAt" | "expiresAt">, hostNow: string): Promise<LearningPromotionCapability | null>;
}

export interface LearningTargetPolicy {
  mutableRoots: readonly string[];
}

export interface LearningPromotionAuthority {
  capabilities: LearningPromotionCapabilityResolver;
  targetPolicy: LearningTargetPolicy;
  now?: () => Date;
}

export interface LearningProposalEvent {
  proposalId: string;
  loopId: string;
  type: LearningProposalEventInput["type"];
  from: LearningProposal["status"];
  to: LearningProposal["status"];
  occurredAt: string;
  actor: string | null;
  reason: string | null;
  capabilityId?: string;
}

export class InvalidLearningProposalTransitionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidLearningProposalTransitionError";
  }
}

export function learningProposalHash(proposalInput: LearningProposal): string {
  const proposal = LearningProposalSchema.parse(proposalInput);
  return createHash("sha256").update(JSON.stringify(proposal)).digest("hex");
}

function canonicalSet(values: readonly string[]): string {
  return JSON.stringify([...values].sort());
}

function assertStatus(proposal: LearningProposal, expected: LearningProposal["status"] | LearningProposal["status"][], event: string): void {
  const allowed = Array.isArray(expected) ? expected : [expected];
  if (!allowed.includes(proposal.status)) {
    throw new InvalidLearningProposalTransitionError(`Cannot ${event} a learning proposal in ${proposal.status} status`);
  }
}

function resultFor(
  proposal: LearningProposal,
  to: LearningProposal["status"],
  event: { type: LearningProposalEventInput["type"]; occurredAt: string; actor?: string; reason?: string },
  approvedBy = proposal.approvedBy,
  capabilityId?: string,
): { proposal: LearningProposal; event: LearningProposalEvent } {
  const updated = LearningProposalSchema.parse({ ...proposal, status: to, ...(approvedBy === undefined ? {} : { approvedBy }) });
  return {
    proposal: updated,
    event: {
      proposalId: proposal.id, loopId: proposal.loopId, type: event.type, from: proposal.status, to,
      occurredAt: event.occurredAt, actor: event.actor ?? null, reason: event.reason ?? null,
      ...(capabilityId === undefined ? {} : { capabilityId }),
    },
  };
}

export function transitionLearningProposal(
  proposalInput: LearningProposal,
  eventInput: LearningProposalEventInput,
): { proposal: LearningProposal; event: LearningProposalEvent } {
  const proposal = LearningProposalSchema.parse(proposalInput);
  const event = LearningProposalEventInputSchema.parse(eventInput);
  switch (event.type) {
    case "validate":
      assertStatus(proposal, "proposed", event.type);
      return resultFor(proposal, "validated", event);
    case "approve": {
      assertStatus(proposal, "validated", event.type);
      if (proposal.risk !== "low" && event.actor === undefined) {
        throw new InvalidLearningProposalTransitionError(`${proposal.risk}-risk learning proposals require human approval`);
      }
      return resultFor(proposal, "approved", event, event.actor ?? "policy:auto");
    }
    case "promote":
      throw new InvalidLearningProposalTransitionError("Promotion requires an opaque capability resolver; use promoteLearningProposal");
    case "reject":
      assertStatus(proposal, ["proposed", "validated"], event.type);
      return resultFor(proposal, "rejected", event);
    case "rollback":
      assertStatus(proposal, "promoted", event.type);
      return resultFor(proposal, "rolled-back", event);
  }
}

async function assertCanonicalTarget(target: string, policy: LearningTargetPolicy): Promise<void> {
  if (policy.mutableRoots.length === 0) {
    throw new InvalidLearningProposalTransitionError("Promotion requires at least one mutable target root");
  }
  for (const rootInput of policy.mutableRoots) {
    const root = await realpath(resolve(rootInput));
    const candidate = resolve(root, target);
    if (isAbsolute(target) || (relative(root, candidate) !== "" && relative(root, candidate).startsWith(`..${sep}`))) continue;
    try {
      const canonical = await realpath(candidate);
      const containment = relative(root, canonical);
      if (containment === "" || (!containment.startsWith(`..${sep}`) && containment !== ".." && !isAbsolute(containment))) return;
    } catch {
      // Missing targets and symlink escapes fail closed.
    }
  }
  throw new InvalidLearningProposalTransitionError("Learning target is not canonically contained in an injected mutable root");
}

export async function promoteLearningProposal(
  proposalInput: LearningProposal,
  input: { capabilityId: string; occurredAt?: string },
  authority: LearningPromotionAuthority,
): Promise<{ proposal: LearningProposal; event: LearningProposalEvent }> {
  const proposal = LearningProposalSchema.parse(proposalInput);
  assertStatus(proposal, "approved", "promote");
  if (typeof input.capabilityId !== "string" || input.capabilityId.length === 0) {
    throw new InvalidLearningProposalTransitionError("Promotion requires an opaque capability ID");
  }
  if (proposal.feedbackWindowIds.length === 0) throw new InvalidLearningProposalTransitionError("Promotion requires a completed feedback window");
  if (proposal.tests.status !== "passed" || proposal.tests.evidenceId === undefined) throw new InvalidLearningProposalTransitionError("Promotion requires passing tests");
  if (proposal.risk !== "low" && proposal.approvedBy === undefined) throw new InvalidLearningProposalTransitionError("Risky promotion requires approval evidence");
  await assertCanonicalTarget(proposal.targetArtifact, authority.targetPolicy);
  const now = (authority.now ?? (() => new Date()))();
  const nowMs = now.getTime();
  if (!Number.isFinite(nowMs)) throw new InvalidLearningProposalTransitionError("Host clock returned an invalid time");
  const expectedCapability = {
    proposalId: proposal.id, proposalHash: learningProposalHash(proposal), loopId: proposal.loopId,
    risk: proposal.risk, targetArtifact: proposal.targetArtifact, evidenceIds: proposal.evidenceIds,
    feedbackWindowIds: proposal.feedbackWindowIds, testEvidenceId: proposal.tests.evidenceId,
    approvedBy: proposal.approvedBy!,
  };
  const capability = await authority.capabilities.consume(input.capabilityId, expectedCapability, now.toISOString());
  const issuedAt = capability === null ? Number.NaN : Date.parse(capability.issuedAt);
  const expiresAt = capability === null ? Number.NaN : Date.parse(capability.expiresAt);
  if (capability === null || capability.id !== input.capabilityId
    || capability.proposalId !== proposal.id || capability.proposalHash !== learningProposalHash(proposal)
    || capability.loopId !== proposal.loopId || capability.risk !== proposal.risk
    || capability.targetArtifact !== proposal.targetArtifact
    || canonicalSet(capability.evidenceIds) !== canonicalSet(proposal.evidenceIds)
    || canonicalSet(capability.feedbackWindowIds) !== canonicalSet(proposal.feedbackWindowIds)
    || capability.testEvidenceId !== proposal.tests.evidenceId || capability.approvedBy !== proposal.approvedBy
    || !Number.isFinite(issuedAt) || !Number.isFinite(expiresAt) || issuedAt > nowMs || expiresAt <= nowMs) {
    throw new InvalidLearningProposalTransitionError("Promotion capability is missing, expired, replayed, or does not match the exact proposal");
  }
  return resultFor(proposal, "promoted", { type: "promote", occurredAt: now.toISOString() }, proposal.approvedBy, capability.id);
}
