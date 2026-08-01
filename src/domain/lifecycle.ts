import type { LoopDefinition, LoopStatus } from "./types.js";

export const lifecycleTransitions: Record<LoopStatus, readonly LoopStatus[]> = {
  idea: ["qualifying", "archived"],
  qualifying: ["blocked", "designing", "archived"],
  blocked: ["qualifying", "designing", "archived"],
  designing: ["planned", "blocked", "archived"],
  planned: ["awaiting-approval", "designing", "archived"],
  "awaiting-approval": ["building", "planned", "archived"],
  building: ["ready", "qa-failed", "failed"],
  "qa-failed": ["building", "failed", "archived"],
  ready: ["shadow", "canary", "active", "inactive"],
  shadow: ["canary", "active", "paused", "degraded", "failed"],
  canary: ["active", "paused", "degraded", "failed"],
  active: ["paused", "degraded", "failed", "inactive"],
  paused: ["active", "building", "inactive", "archived"],
  degraded: ["active", "paused", "failed", "building"],
  failed: ["building", "paused", "inactive", "archived"],
  inactive: ["active", "archived"],
  archived: [],
};

export class InvalidTransitionError extends Error {
  readonly code = "INVALID_TRANSITION";

  constructor(
    readonly from: LoopStatus,
    readonly to: LoopStatus,
    readonly allowed: readonly LoopStatus[],
  ) {
    super(`Cannot transition a loop from ${from} to ${to}`);
    this.name = "InvalidTransitionError";
  }
}

export function canTransition(from: LoopStatus, to: LoopStatus): boolean {
  return lifecycleTransitions[from].includes(to);
}

export function transition(loop: LoopDefinition, to: LoopStatus): LoopDefinition {
  if (!canTransition(loop.status, to)) {
    throw new InvalidTransitionError(loop.status, to, lifecycleTransitions[loop.status]);
  }
  return { ...loop, status: to };
}
