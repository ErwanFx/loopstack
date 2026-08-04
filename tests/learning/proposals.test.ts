import { describe, expect, it } from "vitest";
import {
  InvalidLearningProposalTransitionError,
  LearningProposalSchema,
  transitionLearningProposal,
} from "../../src/learning/proposals.js";

const baseProposal = {
  id: "proposal-document-check-v2",
  loopId: "pv-admin",
  status: "proposed",
  evidenceIds: ["evaluation-12", "outcome-9"],
  feedbackWindowIds: ["feedback-window-2026-q3"],
  targetArtifact: "project-skills/pv-admin-playbook/SKILL.md",
  proposedPatchSummary: "Require a checksum before assembling the mairie dossier",
  expectedMetric: "administrative_rejection_rate",
  expectedMetricEffect: "decrease by at least 2 percentage points",
  risk: "medium",
  testCommand: "pnpm vitest run tests/pv-admin",
  rollbackInstructions: "Restore pv-admin-playbook version 1",
  tests: { status: "passed", evidenceId: "qa-run-42" },
};

describe("learning proposal governance", () => {
  it("moves through validation, approval, promotion, and rollback with append-only events", () => {
    const proposed = LearningProposalSchema.parse(baseProposal);
    const validated = transitionLearningProposal(proposed, {
      type: "validate",
      occurredAt: "2026-08-04T10:00:00.000Z",
    });
    const approved = transitionLearningProposal(validated.proposal, {
      type: "approve",
      actor: "admin-owner",
      occurredAt: "2026-08-04T11:00:00.000Z",
    });
    const promoted = transitionLearningProposal(approved.proposal, {
      type: "promote",
      occurredAt: "2026-08-04T12:00:00.000Z",
    });
    const rolledBack = transitionLearningProposal(promoted.proposal, {
      type: "rollback",
      actor: "admin-owner",
      occurredAt: "2026-08-05T12:00:00.000Z",
    });

    expect([
      validated.event.from,
      validated.event.to,
      approved.event.to,
      promoted.event.to,
      rolledBack.event.to,
    ]).toEqual(["proposed", "validated", "approved", "promoted", "rolled-back"]);
    expect(promoted.proposal.approvedBy).toBe("admin-owner");
  });

  it("allows rejection only from proposed or validated", () => {
    const proposed = LearningProposalSchema.parse(baseProposal);
    const rejected = transitionLearningProposal(proposed, {
      type: "reject",
      actor: "admin-owner",
      reason: "insufficient business value",
      occurredAt: "2026-08-04T10:00:00.000Z",
    });
    expect(rejected.proposal.status).toBe("rejected");
    expect(() => transitionLearningProposal(rejected.proposal, {
      type: "validate",
      occurredAt: "2026-08-04T11:00:00.000Z",
    })).toThrow(InvalidLearningProposalTransitionError);
  });

  it("refuses promotion without completed feedback, passing tests, or risk approval", () => {
    const approved = { ...baseProposal, status: "approved", approvedBy: "admin-owner" };
    expect(() => transitionLearningProposal(LearningProposalSchema.parse({
      ...approved,
      feedbackWindowIds: [],
    }), {
      type: "promote",
      occurredAt: "2026-08-04T12:00:00.000Z",
    })).toThrow(/feedback/i);
    expect(() => transitionLearningProposal(LearningProposalSchema.parse({
      ...approved,
      tests: { status: "failed", evidenceId: "qa-run-42" },
    }), {
      type: "promote",
      occurredAt: "2026-08-04T12:00:00.000Z",
    })).toThrow(/tests/i);
    expect(() => transitionLearningProposal(LearningProposalSchema.parse({
      ...approved,
      approvedBy: undefined,
    }), {
      type: "promote",
      occurredAt: "2026-08-04T12:00:00.000Z",
    })).toThrow(/approval/i);
  });

  it("requires evidence and an executable test and rollback contract", () => {
    for (const invalid of [
      { ...baseProposal, evidenceIds: [] },
      { ...baseProposal, expectedMetric: "" },
      { ...baseProposal, testCommand: "" },
      { ...baseProposal, rollbackInstructions: "" },
    ]) expect(() => LearningProposalSchema.parse(invalid)).toThrow();
  });

  it("rejects read-only Loopstack and installed plugin skill targets", () => {
    for (const targetArtifact of [
      "loopstack:loop-design",
      "/Users/example/.codex/plugins/cache/loopstack/skills/loop-design/SKILL.md",
      "plugin/skills/loop-operate/SKILL.md",
    ]) {
      expect(() => LearningProposalSchema.parse({ ...baseProposal, targetArtifact })).toThrow(/read-only/i);
    }
  });
});
