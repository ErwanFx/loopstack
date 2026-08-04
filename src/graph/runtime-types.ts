import type { CompiledPromptGraph, PromptGraphNode } from "./types.js";

export type GraphRunStatus =
  | "running"
  | "waiting-human"
  | "waiting-external"
  | "completed"
  | "failed"
  | "escalated";

export type GraphRunReasonCode =
  | "MAX_STEPS"
  | "MAX_COST"
  | "DEADLINE"
  | "FAN_IN_INCOMPLETE"
  | "MAX_TRAVERSALS"
  | "NODE_FAILED"
  | "ARTIFACT_CONTRACT_VIOLATION"
  | "SIDE_EFFECT_UNKNOWN"
  | "TOPOLOGY_CHANGED";

export interface GraphNodeExecutionRequest {
  requestId: string;
  graphId: string;
  graphVersion: number;
  topologyHash: string;
  loopId: string;
  runId: string;
  workItemId: string;
  step: number;
  attempt: number;
  node: PromptGraphNode;
  inputs: Readonly<Record<string, unknown>>;
  artifacts: Readonly<Record<string, unknown>>;
  state: Readonly<Record<string, unknown>>;
}

export interface GraphNodeExecutionResult {
  status: "completed" | "wait-human" | "wait-external" | "failed";
  cost: number;
  artifacts?: Record<string, unknown>;
  stateUpdate?: Record<string, unknown>;
  error?: string;
  sideEffectState?: "none" | "confirmed" | "unknown";
}

export interface GraphNodeExecutor {
  execute(request: GraphNodeExecutionRequest): Promise<GraphNodeExecutionResult>;
}

export type GraphCheckpointPhase = "before-node" | "after-node" | "terminal";

export interface GraphCheckpoint {
  graphId: string;
  graphVersion: number;
  topologyHash: string;
  loopId: string;
  runId: string;
  workItemId: string;
  phase: GraphCheckpointPhase;
  status: GraphRunStatus;
  currentNodeId?: string;
  readyNodeIds: string[];
  step: number;
  accumulatedCost: number;
  artifacts: Record<string, unknown>;
  state: Record<string, unknown>;
  nodeAttempts: Record<string, number>;
  edgeTraversals: Record<string, number>;
  triggeredIncomingEdges: Record<string, string[]>;
  startedAt: string;
  updatedAt: string;
  reason?: string;
  reasonCode?: GraphRunReasonCode;
}

export interface GraphCheckpointStore {
  load(runId: string): Promise<GraphCheckpoint | null>;
  save(checkpoint: GraphCheckpoint): Promise<void>;
}

export interface GraphRunInput {
  runId: string;
  workItemId: string;
  initialState: Record<string, unknown>;
  initialArtifacts: Record<string, unknown>;
}

export interface GraphRunnerDependencies {
  store: GraphCheckpointStore;
  executor: GraphNodeExecutor;
  now?: () => Date;
  deadline?: string;
}

export interface GraphRunOutcome {
  status: Exclude<GraphRunStatus, "running">;
  runId: string;
  workItemId: string;
  step: number;
  accumulatedCost: number;
  artifacts: Readonly<Record<string, unknown>>;
  state: Readonly<Record<string, unknown>>;
  edgeTraversals: Readonly<Record<string, number>>;
  reason?: string;
  reasonCode?: GraphRunReasonCode;
}

export interface GraphExecutionEntryContract {
  schemaVersion: 1;
  graphId: string;
  graphVersion: number;
  topologyHash: string;
  executionMode: CompiledPromptGraph["definition"]["executionMode"];
  entrypoint: string;
  checkpointing: "before-and-after-node";
}
