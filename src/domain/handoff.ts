import { HandoffSchema } from "./schemas.js";
import type { Handoff } from "./types.js";

export const skillRoute = {
  "loop-idea": ["loop-qualify"],
  "loop-qualify": ["loop-design"],
  "loop-design": ["loop-storage-design"],
  "loop-storage-design": ["loop-connection-check"],
  "loop-connection-check": ["loop-storage-setup"],
  "loop-storage-setup": ["loop-eric-review"],
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

export class InvalidHandoffError extends Error {
  readonly code = "INVALID_HANDOFF";

  constructor(message: string) {
    super(message);
    this.name = "InvalidHandoffError";
  }
}

export function createHandoff(input: unknown): Handoff {
  const handoff = HandoffSchema.parse(input);

  if (handoff.status === "completed") {
    if (!handoff.next_skill) throw new InvalidHandoffError("A completed skill requires a next skill");
    const allowed = skillRoute[handoff.completed_skill as keyof typeof skillRoute];
    if (!allowed || !(allowed as readonly string[]).includes(handoff.next_skill)) {
      throw new InvalidHandoffError(
        `Cannot hand off from ${handoff.completed_skill} to ${handoff.next_skill}`,
      );
    }
  } else if (handoff.next_skill) {
    throw new InvalidHandoffError("Blocked or approval handoffs must stop without a next skill");
  }

  if (handoff.status === "blocked" && handoff.blocking_requirements.length === 0) {
    throw new InvalidHandoffError("A blocked handoff requires at least one blocking requirement");
  }

  return handoff;
}
