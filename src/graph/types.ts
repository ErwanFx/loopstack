import type { z } from "zod";
import type {
  GraphAgentBindingSchema,
  GraphConditionSchema,
  GraphExecutionModeSchema,
  PromptGraphDefinitionSchema,
  PromptGraphEdgeSchema,
  PromptGraphNodeSchema,
} from "./schemas.js";

export type GraphExecutionMode = z.infer<typeof GraphExecutionModeSchema>;
export type GraphAgentBinding = z.infer<typeof GraphAgentBindingSchema>;
export type PromptGraphNode = z.infer<typeof PromptGraphNodeSchema>;
export type PromptGraphEdge = z.infer<typeof PromptGraphEdgeSchema>;
export type GraphCondition = z.infer<typeof GraphConditionSchema>;
export type PromptGraphDefinition = z.infer<typeof PromptGraphDefinitionSchema>;

export type GraphCompileIssueCode =
  | "SCHEMA_INVALID"
  | "DUPLICATE_NODE"
  | "DUPLICATE_AGENT"
  | "UNKNOWN_NODE"
  | "UNKNOWN_AGENT"
  | "UNKNOWN_ENTRYPOINT"
  | "UNREACHABLE_NODE"
  | "ARTIFACT_CONTRACT_MISMATCH"
  | "UNBOUNDED_CYCLE"
  | "MISSING_IDEMPOTENCY"
  | "MISSING_RESOURCE_LOCK"
  | "HIDDEN_RESOURCE_EDGE"
  | "UNKNOWN_IMPROVEMENT_NODE"
  | "AI_IMPROVEMENT_REQUIRED"
  | "EVIDENCE_ANCHOR_REQUIRED"
  | "UNKNOWN_ANCHOR_NODE"
  | "UNPROTECTED_ANCHOR"
  | "INVALID_EXECUTION_MODE";

export interface GraphCompileIssue {
  code: GraphCompileIssueCode;
  message: string;
  nodeId?: string;
  edgeIndex?: number;
  path?: string;
}

export interface GraphCompileWarning {
  code: "POTENTIAL_FAKE_EDGE";
  message: string;
  from: string;
  to: string;
}

export interface CompiledPromptGraph {
  definition: PromptGraphDefinition;
  nodes: ReadonlyMap<string, PromptGraphNode>;
  agents: ReadonlyMap<string, GraphAgentBinding>;
  outgoing: ReadonlyMap<string, readonly PromptGraphEdge[]>;
  incoming: ReadonlyMap<string, readonly PromptGraphEdge[]>;
  warnings: readonly GraphCompileWarning[];
  topologyHash: string;
}
