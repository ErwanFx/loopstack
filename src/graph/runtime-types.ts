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
  | "TOPOLOGY_CHANGED"
  | "CHECKPOINT_MISMATCH"
  | "RUN_CLAIMED"
  | "NODE_TIMEOUT";

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
  idempotencyKey?: string;
}

export interface GraphNodeExecutionResult {
  requestId: string;
  status: "completed" | "wait-human" | "wait-external" | "failed";
  cost: number;
  artifacts?: Record<string, unknown>;
  stateUpdate?: Record<string, unknown>;
  error?: string;
  sideEffectState?: "none" | "confirmed" | "unknown";
  effectEvidenceId?: string;
}

export interface GraphNodeExecutor {
  execute(request: GraphNodeExecutionRequest): Promise<GraphNodeExecutionResult>;
}

export type GraphCheckpointPhase = "before-node" | "after-node" | "terminal";

export interface GraphCheckpoint {
  revision: number;
  graphId: string;
  graphVersion: number;
  topologyHash: string;
  loopId: string;
  runId: string;
  workItemId: string;
  runContractHash: string;
  inputSnapshotHash: string;
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
  claimNode(runId: string, nodeId: string, expectedRevision: number, ownerId: string, leaseUntil: string): Promise<string | null>;
  renewClaim(claimToken: string, expectedRevision: number, leaseUntil: string): Promise<boolean>;
  saveAfterNode(checkpoint: GraphCheckpoint, expectedRevision: number, claimToken: string): Promise<GraphCheckpoint>;
  releaseNode(runId: string, nodeId: string, claimToken: string): Promise<void>;
}

export interface GraphRunInput {
  runId: string;
  workItemId: string;
  initialState: Record<string, unknown>;
  initialArtifacts: Record<string, unknown>;
  runContractHash: string;
  inputSnapshotHash: string;
  resumeCapabilityId?: string;
}

export interface GraphResumeCapability {
  id: string;
  graphId: string;
  graphVersion: number;
  topologyHash: string;
  loopId: string;
  runId: string;
  workItemId: string;
  nodeId: string;
  waitStatus: "waiting-human" | "waiting-external";
  checkpointRevision: number;
  oldSnapshotHash: string;
  newSnapshotHash: string;
  runContractHash: string;
  issuedAt: string;
  expiresAt: string;
}

export interface GraphResumeCapabilityResolver {
  consume(id: string, expectedEnvelope: Omit<GraphResumeCapability, "id" | "issuedAt" | "expiresAt">, hostNow: string): Promise<GraphResumeCapability | null>;
}

export interface GraphEffectTrustEnvelope {
  requestId: string; graphId: string; graphVersion: number; topologyHash: string;
  loopId: string; runId: string; workItemId: string; nodeId: string; idempotencyKey: string;
}
export interface GraphEffectTrustResolver {
  consume(id: string, expectedEnvelope: GraphEffectTrustEnvelope, hostNow: string): Promise<boolean>;
}

export interface GraphRunnerDependencies {
  store: GraphCheckpointStore;
  executor: GraphNodeExecutor;
  now?: () => Date;
  deadline?: string;
  runnerId: string;
  leaseSeconds?: number;
  setTimeout?: (callback: () => void, milliseconds: number) => unknown;
  clearTimeout?: (handle: unknown) => void;
  setInterval?: (callback: () => void, milliseconds: number) => unknown;
  clearInterval?: (handle: unknown) => void;
  resumeCapabilities?: GraphResumeCapabilityResolver;
  effectTrustResolver?: GraphEffectTrustResolver;
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
