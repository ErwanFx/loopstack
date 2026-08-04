import { z } from "zod";
import { LoopIdSchema } from "../domain/ids.js";

export const LearningProposalStatusSchema = z.enum([
  "proposed",
  "validated",
  "approved",
  "promoted",
  "rejected",
  "rolled-back",
]);

function isReadonlyPluginTarget(target: string): boolean {
  const normalized = target.replaceAll("\\", "/").toLowerCase();
  return normalized.startsWith("loopstack:")
    || /(^|\/)plugins?(?:\/[^/]+)*\/skills\//.test(normalized)
    || normalized.includes("/.codex/plugins/cache/");
}

export const LearningProposalSchema = z.object({
  id: LoopIdSchema,
  loopId: LoopIdSchema,
  status: LearningProposalStatusSchema,
  evidenceIds: z.array(z.string().min(1)).min(1),
  feedbackWindowIds: z.array(z.string().min(1)).default([]),
  targetArtifact: z.string().min(1).refine(
    (target) => !isReadonlyPluginTarget(target),
    "Plugin-provided skills are read-only learning targets",
  ),
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
  z.object({
    type: z.literal("approve"),
    actor: z.string().min(1).optional(),
    occurredAt: z.iso.datetime(),
  }),
  z.object({ type: z.literal("promote"), occurredAt: z.iso.datetime() }),
  z.object({
    type: z.literal("reject"),
    actor: z.string().min(1),
    reason: z.string().min(1),
    occurredAt: z.iso.datetime(),
  }),
  z.object({
    type: z.literal("rollback"),
    actor: z.string().min(1),
    occurredAt: z.iso.datetime(),
  }),
]);

export type LearningProposal = z.infer<typeof LearningProposalSchema>;
export type LearningProposalEventInput = z.infer<typeof LearningProposalEventInputSchema>;

export interface LearningProposalEvent {
  proposalId: string;
  loopId: string;
  type: LearningProposalEventInput["type"];
  from: LearningProposal["status"];
  to: LearningProposal["status"];
  occurredAt: string;
  actor: string | null;
  reason: string | null;
}

export class InvalidLearningProposalTransitionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidLearningProposalTransitionError";
  }
}

function assertStatus(
  proposal: LearningProposal,
  expected: LearningProposal["status"] | LearningProposal["status"][],
  event: LearningProposalEventInput["type"],
): void {
  const allowed = Array.isArray(expected) ? expected : [expected];
  if (!allowed.includes(proposal.status)) {
    throw new InvalidLearningProposalTransitionError(
      `Cannot ${event} a learning proposal in ${proposal.status} status`,
    );
  }
}

export function transitionLearningProposal(
  proposalInput: LearningProposal,
  eventInput: LearningProposalEventInput,
): { proposal: LearningProposal; event: LearningProposalEvent } {
  const proposal = LearningProposalSchema.parse(proposalInput);
  const event = LearningProposalEventInputSchema.parse(eventInput);
  let to: LearningProposal["status"];
  let approvedBy = proposal.approvedBy;

  switch (event.type) {
    case "validate":
      assertStatus(proposal, "proposed", event.type);
      to = "validated";
      break;
    case "approve":
      assertStatus(proposal, "validated", event.type);
      if ((proposal.risk === "medium" || proposal.risk === "high") && event.actor === undefined) {
        throw new InvalidLearningProposalTransitionError(
          `${proposal.risk}-risk learning proposals require human approval`,
        );
      }
      approvedBy = event.actor ?? "policy:auto";
      to = "approved";
      break;
    case "promote":
      assertStatus(proposal, "approved", event.type);
      if (proposal.feedbackWindowIds.length === 0) {
        throw new InvalidLearningProposalTransitionError(
          "Promotion requires at least one completed feedback window",
        );
      }
      if (proposal.tests.status !== "passed") {
        throw new InvalidLearningProposalTransitionError("Promotion requires passing tests");
      }
      if ((proposal.risk === "medium" || proposal.risk === "high") && proposal.approvedBy === undefined) {
        throw new InvalidLearningProposalTransitionError(
          `${proposal.risk}-risk promotion requires approval evidence`,
        );
      }
      to = "promoted";
      break;
    case "reject":
      assertStatus(proposal, ["proposed", "validated"], event.type);
      to = "rejected";
      break;
    case "rollback":
      assertStatus(proposal, "promoted", event.type);
      to = "rolled-back";
      break;
  }

  const updated = LearningProposalSchema.parse({
    ...proposal,
    status: to,
    ...(approvedBy === undefined ? {} : { approvedBy }),
  });
  return {
    proposal: updated,
    event: {
      proposalId: proposal.id,
      loopId: proposal.loopId,
      type: event.type,
      from: proposal.status,
      to,
      occurredAt: event.occurredAt,
      actor: "actor" in event ? event.actor ?? null : null,
      reason: "reason" in event ? event.reason : null,
    },
  };
}

