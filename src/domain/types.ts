import type { z } from "zod";
import type {
  ApprovalPolicySchema,
  GateEvidenceSchema,
  GateKindSchema,
  HandoffSchema,
  LoopDefinitionSchema,
  LoopStatusSchema,
  PublicJourneySchema,
} from "./schemas.js";

export type LoopStatus = z.infer<typeof LoopStatusSchema>;
export type LoopDefinition = z.infer<typeof LoopDefinitionSchema>;
export type Handoff = z.infer<typeof HandoffSchema>;
export type PublicJourney = z.infer<typeof PublicJourneySchema>;
export type GateKind = z.infer<typeof GateKindSchema>;
export type GateEvidence = z.infer<typeof GateEvidenceSchema>;
export type ApprovalPolicy = z.infer<typeof ApprovalPolicySchema>;

export type CanonicalHandoff = {
  source_route_version: "v1" | "v2";
  journey: PublicJourney;
  substage: string;
  next_journey: PublicJourney | null;
  source: Handoff;
};
