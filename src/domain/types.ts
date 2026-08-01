import type { z } from "zod";
import type {
  ApprovalPolicySchema,
  HandoffSchema,
  LoopDefinitionSchema,
  LoopStatusSchema,
} from "./schemas.js";

export type LoopStatus = z.infer<typeof LoopStatusSchema>;
export type LoopDefinition = z.infer<typeof LoopDefinitionSchema>;
export type Handoff = z.infer<typeof HandoffSchema>;
export type ApprovalPolicy = z.infer<typeof ApprovalPolicySchema>;
