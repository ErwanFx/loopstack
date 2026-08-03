import { HandoffSchema } from "./schemas.js";
import { hashPlan } from "./approval-token.js";
import type { CanonicalHandoff, GateEvidence, GateKind, Handoff, PublicJourney } from "./types.js";

/** Public, user-facing Loopstack workflows. */
export const publicSkillRoute = {
  "using-loopstack": ["loop-discover"],
  "loop-discover": ["loop-design"],
  "loop-design": ["loop-plan"],
  "loop-plan": ["loop-build"],
  "loop-build": ["loop-launch"],
  "loop-launch": ["loop-operate"],
  "loop-operate": ["loop-operate", "loop-plan"],
} as const;

/** Exact v1 routes remain valid for persisted handoffs and old runtimes. */
export const legacySkillRoute = {
  "using-loopstack": ["loop-idea"],
  "loop-idea": ["loop-qualify"],
  "loop-qualify": ["loop-design"],
  "loop-design": ["loop-storage-design", "loop-eric-review"],
  "loop-storage-design": ["loop-connection-check"],
  "loop-connection-check": ["loop-storage-setup"],
  "loop-storage-setup": ["loop-eric-review", "loop-connection-check"],
  "loop-eric-review": ["loop-plan", "loop-design"],
  "loop-plan": ["loop-implement"],
  "loop-implement": ["loop-qa"],
  "loop-qa": ["loop-deploy", "loop-debug"],
  "loop-deploy": ["loop-monitor"],
  "loop-monitor": ["loop-improve", "loop-modify", "loop-debug"],
  "loop-modify": ["loop-plan"],
  "loop-debug": ["loop-plan"],
  "loop-improve": ["loop-plan"],
  "loop-list": ["loop-show"],
  "loop-show": ["loop-monitor"],
} as const;

/** v1 skill names resolve to one of the six public lifecycle phases. */
export const legacySkillAliases: Record<string, keyof typeof publicSkillRoute> = {
  "using-loopstack": "loop-discover",
  "loop-idea": "loop-discover",
  "loop-qualify": "loop-discover",
  "loop-storage-design": "loop-design",
  "loop-connection-check": "loop-design",
  "loop-eric-review": "loop-design",
  "loop-storage-setup": "loop-build",
  "loop-implement": "loop-build",
  "loop-qa": "loop-build",
  "loop-deploy": "loop-launch",
  "loop-list": "loop-operate",
  "loop-show": "loop-operate",
  "loop-monitor": "loop-operate",
  "loop-debug": "loop-operate",
  "loop-modify": "loop-operate",
  "loop-improve": "loop-operate",
};

/** @deprecated Legacy v1 routes only. Use createHandoff()/runPublicTransition() for versioned routing. */
export const skillRoute: Record<string, readonly string[]> = legacySkillRoute;

export function resolvePublicSkill(skill: string): string {
  return legacySkillAliases[skill] ?? skill;
}

const terminalSkills = new Set(["loop-qualify", "loop-discover", "loop-operate"]);

const requiredRouteGates: Record<string, readonly GateKind[]> = {
  "loop-design->loop-plan": ["design-approval", "storage-approval"],
  "loop-plan->loop-build": ["plan-approval"],
  "loop-build->loop-launch": ["qa-pass"],
  "loop-launch->loop-operate": ["activation-approval"],
};

export class InvalidHandoffError extends Error {
  readonly code = "INVALID_HANDOFF";

  constructor(message: string) {
    super(message);
    this.name = "InvalidHandoffError";
  }
}

export type GateTrustContext = {
  trustedEvidenceHashes: readonly string[];
  trustedArtifactHashes: Readonly<Record<string, string>>;
  trustedApprovers: readonly string[];
};

export function hashGateEvidence(evidence: GateEvidence): string {
  return hashPlan(evidence);
}

function allowedNextSkills(skill: string, routeVersion?: "v1" | "v2"): readonly string[] | undefined {
  if (routeVersion === "v2") {
    return publicSkillRoute[skill as keyof typeof publicSkillRoute] as readonly string[] | undefined;
  }
  return legacySkillRoute[skill as keyof typeof legacySkillRoute] as readonly string[] | undefined;
}

function assertGateEvidenceStructure(
  handoff: Handoff,
  gate: GateKind,
  now = new Date(),
): void {
  if (Number.isNaN(now.getTime())) throw new InvalidHandoffError(`${gate} requires a valid current time`);
  if (handoff.route_version !== "v2") {
    throw new InvalidHandoffError(`Gate ${gate} requires a v2 handoff`);
  }
  const evidence = handoff.gate_evidence.find((candidate) => candidate.gate === gate);
  if (!evidence) throw new InvalidHandoffError(`Missing ${gate} evidence`);
  if (evidence.scope_hash !== handoff.scope_hash) {
    throw new InvalidHandoffError(`${gate} evidence does not match the handoff scope`);
  }
  if (!handoff.artifacts.includes(evidence.artifact)) {
    throw new InvalidHandoffError(`${gate} evidence artifact is not attached to the handoff`);
  }
  if (handoff.artifact_hashes[evidence.artifact] !== evidence.artifact_hash) {
    throw new InvalidHandoffError(`${gate} evidence hash does not match the attached artifact hash`);
  }
  if (Date.parse(evidence.approved_at) > now.getTime()) {
    throw new InvalidHandoffError(`${gate} evidence approval time is in the future`);
  }
  if (Date.parse(evidence.expires_at) <= now.getTime()) {
    throw new InvalidHandoffError(`${gate} evidence has expired`);
  }
}

export function assertGateAuthorization(
  handoff: Handoff,
  gate: GateKind,
  trust: GateTrustContext | undefined,
  now = new Date(),
): void {
  assertGateEvidenceStructure(handoff, gate, now);
  if (!trust) throw new InvalidHandoffError(`${gate} requires an external trust context`);
  if (handoff.route_version !== "v2") throw new InvalidHandoffError(`Gate ${gate} requires a v2 handoff`);
  const evidence = handoff.gate_evidence.find((candidate) => candidate.gate === gate)!;
  if (!trust.trustedEvidenceHashes.includes(hashGateEvidence(evidence))) {
    throw new InvalidHandoffError(`${gate} evidence is not present in the trusted approval registry`);
  }
  if (trust.trustedArtifactHashes[evidence.artifact] !== evidence.artifact_hash) {
    throw new InvalidHandoffError(`${gate} artifact hash is not trusted`);
  }
  if (!trust.trustedApprovers.includes(evidence.approved_by)) {
    throw new InvalidHandoffError(`${gate} approver is not trusted`);
  }
}

function validateV2Contract(handoff: Handoff): void {
  if (handoff.route_version !== "v2") return;

  const resolvedJourney = resolvePublicSkill(handoff.completed_skill);
  const resolvedNext = handoff.next_skill ? resolvePublicSkill(handoff.next_skill) : null;
  if (handoff.journey !== resolvedJourney) {
    throw new InvalidHandoffError("Handoff journey conflicts with completed_skill");
  }
  if (handoff.status === "completed" && handoff.next_journey !== resolvedNext) {
    throw new InvalidHandoffError("Handoff next_journey conflicts with next_skill");
  }
  if (!handoff.completed_workers.includes(handoff.substage)) {
    throw new InvalidHandoffError("Handoff substage must be listed in completed_workers");
  }
  if (handoff.status === "completed" && handoff.pending_gate !== null) {
    throw new InvalidHandoffError("A completed v2 handoff cannot have a pending gate");
  }
  if (handoff.status !== "completed" && handoff.pending_gate === null) {
    throw new InvalidHandoffError("A stopped v2 handoff requires a pending gate");
  }

  if (handoff.next_skill) {
    const edge = `${handoff.completed_skill}->${handoff.next_skill}`;
    for (const gate of requiredRouteGates[edge] ?? []) assertGateEvidenceStructure(handoff, gate);
    if (edge === "loop-launch->loop-operate" && handoff.activation_allowed !== true) {
      throw new InvalidHandoffError("Activation must be explicitly allowed before entering operate");
    }
  }
}

export function createHandoff(input: unknown): Handoff {
  const handoff = HandoffSchema.parse(input);

  if (handoff.status === "completed") {
    if (!handoff.next_skill) {
      if (!terminalSkills.has(handoff.completed_skill)) {
        throw new InvalidHandoffError("A non-terminal completed skill requires a next skill");
      }
    } else {
      const allowed = allowedNextSkills(handoff.completed_skill, handoff.route_version);
      if (!allowed || !allowed.includes(handoff.next_skill)) {
        throw new InvalidHandoffError(
          `Cannot hand off from ${handoff.completed_skill} to ${handoff.next_skill}`,
        );
      }
    }
  } else if (handoff.next_skill) {
    throw new InvalidHandoffError("Blocked or approval handoffs must stop without a next skill");
  }

  if (handoff.status === "blocked" && handoff.blocking_requirements.length === 0) {
    throw new InvalidHandoffError("A blocked handoff requires at least one blocking requirement");
  }

  if (handoff.route_version === "v1" || handoff.route_version === undefined) {
    const resolvedJourney = resolvePublicSkill(handoff.completed_skill);
    const resolvedNext = handoff.next_skill ? resolvePublicSkill(handoff.next_skill) : null;
    if (handoff.journey && handoff.journey !== resolvedJourney) {
      throw new InvalidHandoffError("Handoff journey conflicts with completed_skill");
    }
    if (handoff.next_skill && handoff.next_journey !== undefined && handoff.next_journey !== resolvedNext) {
      throw new InvalidHandoffError("Handoff next_journey conflicts with next_skill");
    }
  }

  validateV2Contract(handoff);

  return handoff;
}

export function normalizeHandoff(input: unknown): CanonicalHandoff {
  const source = createHandoff(input);
  const resolvedJourney = resolvePublicSkill(source.completed_skill);
  const resolvedNext = source.next_skill ? resolvePublicSkill(source.next_skill) : null;
  if (!(resolvedJourney in publicSkillRoute)) {
    throw new InvalidHandoffError(`Unknown public journey for ${source.completed_skill}`);
  }
  if (resolvedNext && !(resolvedNext in publicSkillRoute)) {
    throw new InvalidHandoffError(`Unknown public journey for ${source.next_skill}`);
  }
  return {
    source_route_version: source.route_version ?? "v1",
    journey: resolvedJourney as PublicJourney,
    substage: source.substage ?? source.completed_skill,
    next_journey: resolvedNext as PublicJourney | null,
    source,
  };
}

export function resolveHandoffTarget(input: unknown): PublicJourney | null {
  return normalizeHandoff(input).next_journey;
}

/**
 * Superpowers-style continuous flow: a valid completed handoff invokes the
 * next public workflow immediately. Approval and blocker handoffs always stop.
 */
export function shouldAutoContinue(handoff: Handoff, trust?: GateTrustContext): boolean {
  const validated = createHandoff(handoff);
  if (validated.status !== "completed" || !validated.next_skill) return false;
  if (validated.route_version === "v2") {
    const edge = `${validated.completed_skill}->${validated.next_skill}`;
    for (const gate of requiredRouteGates[edge] ?? []) assertGateAuthorization(validated, gate, trust);
  } else {
    const target = resolvePublicSkill(validated.next_skill);
    if (target === "loop-build" || target === "loop-launch") return false;
  }
  return true;
}
