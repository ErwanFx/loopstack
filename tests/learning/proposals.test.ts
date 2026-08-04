import { mkdir, symlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { mkdtemp } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import {
  InvalidLearningProposalTransitionError,
  LearningProposalSchema,
  learningProposalHash,
  promoteLearningProposal,
  transitionLearningProposal,
  type LearningPromotionCapability,
  type LearningPromotionCapabilityResolver,
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

function resolverFor(capability: LearningPromotionCapability): LearningPromotionCapabilityResolver {
  let consumed = false;
  return {
    async consume(id) {
      if (consumed || id !== capability.id) return null;
      consumed = true;
      return structuredClone(capability);
    },
  };
}

async function promotionFixture() {
  const root = await mkdtemp(join(tmpdir(), "loopstack-learning-"));
  const target = join(root, baseProposal.targetArtifact);
  await mkdir(join(target, ".."), { recursive: true });
  await writeFile(target, "safe");
  const approved = LearningProposalSchema.parse({ ...baseProposal, status: "approved", approvedBy: "admin-owner" });
  const capability: LearningPromotionCapability = {
    id: "promotion-capability-1",
    proposalId: approved.id,
    proposalHash: learningProposalHash(approved),
    loopId: approved.loopId,
    risk: approved.risk,
    targetArtifact: approved.targetArtifact,
    evidenceIds: approved.evidenceIds,
    feedbackWindowIds: approved.feedbackWindowIds,
    testEvidenceId: approved.tests.evidenceId!,
    approvedBy: approved.approvedBy!,
    issuedAt: "2026-08-04T11:30:00.000Z",
    expiresAt: "2026-08-04T12:30:00.000Z",
  };
  return { root, approved, capability };
}

describe("learning proposal governance", () => {
  it("moves through validation, approval, opaque promotion, and rollback", async () => {
    const proposed = LearningProposalSchema.parse(baseProposal);
    const validated = transitionLearningProposal(proposed, { type: "validate", occurredAt: "2026-08-04T10:00:00.000Z" });
    const approved = transitionLearningProposal(validated.proposal, {
      type: "approve", actor: "admin-owner", occurredAt: "2026-08-04T11:00:00.000Z",
    });
    const fixture = await promotionFixture();
    const promoted = await promoteLearningProposal(approved.proposal, {
      capabilityId: fixture.capability.id,
      occurredAt: "caller-time-is-not-authoritative",
    }, {
      capabilities: resolverFor({ ...fixture.capability, proposalHash: learningProposalHash(approved.proposal) }),
      targetPolicy: { mutableRoots: [fixture.root] },
      now: () => new Date("2026-08-04T12:00:00.000Z"),
    });
    const rolledBack = transitionLearningProposal(promoted.proposal, {
      type: "rollback", actor: "admin-owner", occurredAt: "2026-08-05T12:00:00.000Z",
    });
    expect([validated.event.to, approved.event.to, promoted.event.to, rolledBack.event.to])
      .toEqual(["validated", "approved", "promoted", "rolled-back"]);
    expect(promoted.event.occurredAt).toBe("2026-08-04T12:00:00.000Z");
  });

  it("allows rejection only from proposed or validated", () => {
    const proposed = LearningProposalSchema.parse(baseProposal);
    const rejected = transitionLearningProposal(proposed, {
      type: "reject", actor: "admin-owner", reason: "insufficient business value",
      occurredAt: "2026-08-04T10:00:00.000Z",
    });
    expect(rejected.proposal.status).toBe("rejected");
    expect(() => transitionLearningProposal(rejected.proposal, {
      type: "validate", occurredAt: "2026-08-04T11:00:00.000Z",
    })).toThrow(InvalidLearningProposalTransitionError);
  });

  it("requires evidence and an executable test and rollback contract", () => {
    for (const invalid of [
      { ...baseProposal, evidenceIds: [] }, { ...baseProposal, expectedMetric: "" },
      { ...baseProposal, testCommand: "" }, { ...baseProposal, rollbackInstructions: "" },
    ]) expect(() => LearningProposalSchema.parse(invalid)).toThrow();
  });

  it("rejects read-only, traversal, and sensitive learning targets", () => {
    for (const targetArtifact of [
      "loopstack:loop-design", "plugin/skills/loop-operate/SKILL.md", "../outside/SKILL.md",
      "project-skills/../../outside.md", "/etc/passwd", "C:\\Windows\\system.ini",
      ".env", "package.json", "keys/id_rsa", "keys/server.pem", "keys/private.key",
    ]) expect(() => LearningProposalSchema.parse({ ...baseProposal, targetArtifact })).toThrow();
  });

  it("cannot promote from a caller-authored trust object and consumes opaque authority once", async () => {
    const { root, approved, capability } = await promotionFixture();
    await expect(promoteLearningProposal(approved, {
      capabilityId: capability.id, occurredAt: "2026-08-04T12:00:00.000Z",
    }, {
      capabilities: { consume: async () => null }, targetPolicy: { mutableRoots: [root] },
      now: () => new Date("2026-08-04T12:00:00.000Z"),
    })).rejects.toThrow(/capability/i);
    const resolver = resolverFor(capability);
    await promoteLearningProposal(approved, { capabilityId: capability.id, occurredAt: "ignored" }, {
      capabilities: resolver, targetPolicy: { mutableRoots: [root] },
      now: () => new Date("2026-08-04T12:00:00.000Z"),
    });
    await expect(promoteLearningProposal(approved, { capabilityId: capability.id, occurredAt: "ignored" }, {
      capabilities: resolver, targetPolicy: { mutableRoots: [root] },
      now: () => new Date("2026-08-04T12:00:00.000Z"),
    })).rejects.toThrow(/capability/i);
  });

  it("binds authority to exact proposal/hash/risk/target/window and rejects symlink escapes", async () => {
    const { root, approved, capability } = await promotionFixture();
    for (const mismatch of [
      { ...capability, proposalId: "other-proposal" },
      { ...capability, proposalHash: "0".repeat(64) },
      { ...capability, risk: "high" as const },
      { ...capability, targetArtifact: "other/SKILL.md" },
      { ...capability, feedbackWindowIds: ["other-window"] },
      { ...capability, expiresAt: "2026-08-04T12:00:00.000Z" },
    ]) {
      await expect(promoteLearningProposal(approved, { capabilityId: mismatch.id, occurredAt: "ignored" }, {
        capabilities: resolverFor(mismatch), targetPolicy: { mutableRoots: [root] },
        now: () => new Date("2026-08-04T12:00:00.000Z"),
      })).rejects.toThrow();
    }
    const outside = await mkdtemp(join(tmpdir(), "loopstack-outside-"));
    await writeFile(join(outside, "SKILL.md"), "outside");
    const linkRoot = await mkdtemp(join(tmpdir(), "loopstack-root-"));
    await mkdir(join(linkRoot, "project-skills"), { recursive: true });
    await symlink(outside, join(linkRoot, "project-skills", "pv-admin-playbook"));
    await expect(promoteLearningProposal(approved, { capabilityId: capability.id, occurredAt: "ignored" }, {
      capabilities: resolverFor(capability), targetPolicy: { mutableRoots: [linkRoot] },
      now: () => new Date("2026-08-04T12:00:00.000Z"),
    })).rejects.toThrow(/target|root|contain/i);
  });
});
