import { createHandoff, resolveHandoffTarget, shouldAutoContinue, type GateTrustContext } from "./handoff.js";
import type { PublicJourney } from "./types.js";

export type PublicTransitionExecutor = {
  routePublicSkill(skill: PublicJourney): void;
};

export type PublicTransitionResult =
  | { kind: "stopped"; target: null }
  | { kind: "routed"; target: PublicJourney };

/**
 * Execute only public workflow navigation. This API intentionally has no
 * mutation, scheduling, registry, deployment, or activation capability.
 */
export function runPublicTransition(
  input: unknown,
  executor: PublicTransitionExecutor,
  trust?: GateTrustContext,
): PublicTransitionResult {
  const handoff = createHandoff(input);
  if (!shouldAutoContinue(handoff, trust)) return { kind: "stopped", target: null };
  const target = resolveHandoffTarget(handoff);
  if (!target) return { kind: "stopped", target: null };
  executor.routePublicSkill(target);
  return { kind: "routed", target };
}
