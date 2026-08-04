import type { LoopDefinition, LoopStatus } from "./types.js";
import { z } from "zod";

export type TransitionTrustRequest = {
  evidenceId: string;
  loopId: string;
  from: LoopStatus;
  to: LoopStatus;
  now: Date;
};

/** Host-owned, consuming authorization boundary. Caller proof material is never accepted here. */
export interface TransitionTrustResolver {
  authorizeAndConsume(request: TransitionTrustRequest): boolean;
}

export type TransitionAuthorization = {
  evidenceId: string;
  now?: Date;
};

const TransitionAuthorizationSchema = z.object({
  evidenceId: z.string().min(1),
  now: z.date().optional(),
}).strict();

export const lifecycleTransitions: Record<LoopStatus, readonly LoopStatus[]> = {
  idea: ["qualifying", "archived"],
  qualifying: ["blocked", "designing", "archived"],
  blocked: ["qualifying", "designing", "archived"],
  designing: ["planned", "blocked", "archived"],
  planned: ["awaiting-approval", "designing", "archived"],
  "awaiting-approval": ["building", "planned", "archived"],
  building: ["ready", "qa-failed", "failed"],
  "qa-failed": ["building", "failed", "archived"],
  ready: ["shadow", "inactive"],
  shadow: ["canary", "paused", "degraded", "failed"],
  canary: ["active", "paused", "degraded", "failed"],
  active: ["paused", "degraded", "failed", "inactive"],
  paused: ["active", "building", "inactive", "archived"],
  degraded: ["active", "paused", "failed", "building"],
  failed: ["building", "paused", "inactive", "archived"],
  inactive: ["archived"],
  archived: [],
};

const gatedTargets = new Set<LoopStatus>(["building", "ready", "shadow", "canary", "active"]);
export function isGatedTransition(_from: LoopStatus, to: LoopStatus): boolean {
  return gatedTargets.has(to);
}

export class InvalidTransitionError extends Error {
  readonly code = "INVALID_TRANSITION";
  constructor(readonly from: LoopStatus, readonly to: LoopStatus, readonly allowed: readonly LoopStatus[]) {
    super(`Cannot transition a loop from ${from} to ${to}`);
    this.name = "InvalidTransitionError";
  }
}

export class GateEvidenceRequiredError extends Error {
  readonly code = "GATE_EVIDENCE_REQUIRED";
  constructor(readonly from: LoopStatus, readonly to: LoopStatus) {
    super(`Transition from ${from} to ${to} requires a consuming host trust resolver`);
    this.name = "GateEvidenceRequiredError";
  }
}

export function canTransition(from: LoopStatus, to: LoopStatus): boolean {
  return lifecycleTransitions[from].includes(to);
}

export function transition(
  loop: LoopDefinition,
  to: LoopStatus,
  authorization?: TransitionAuthorization,
  trustResolver?: TransitionTrustResolver,
): LoopDefinition {
  if (!canTransition(loop.status, to)) throw new InvalidTransitionError(loop.status, to, lifecycleTransitions[loop.status]);
  if (isGatedTransition(loop.status, to)) {
    const parsed = TransitionAuthorizationSchema.safeParse(authorization);
    const accepted = parsed.success && trustResolver?.authorizeAndConsume({
      evidenceId: parsed.data.evidenceId,
      loopId: loop.id,
      from: loop.status,
      to,
      now: parsed.data.now ?? new Date(),
    });
    if (!accepted) throw new GateEvidenceRequiredError(loop.status, to);
  }
  return { ...loop, status: to };
}
