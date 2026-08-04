import { createHash } from "node:crypto";
import { ProcessDefinitionSchema, WorkItemEventSchema, WorkItemSchema, type ProcessDefinition, type ProcessState, type WorkItem, type WorkItemEvent } from "./schemas.js";

export class InvalidWorkItemTransitionError extends Error { constructor(message: string) { super(message); this.name = "InvalidWorkItemTransitionError"; } }
export class WorkItemRevisionConflictError extends Error {
  constructor(expected: number, actual: number) { super(`Expected work-item revision ${expected}, received ${actual}`); this.name = "WorkItemRevisionConflictError"; }
}
export interface CreateWorkItemInput { id: string; loopId: string; eventAt: string; externalReferences?: Record<string, string>; missingInputs?: string[] }
export interface StateTransitionRecord {
  workItemId: string; loopId: string; from: string; to: string; event: string; actor: WorkItemEvent["actor"];
  occurredAt: string; idempotencyKey: string; action: string | null; gateId: string | null; resultingRevision: number;
  authorizedGateId: string | null; capabilityId: string | null; payloadDigest: string;
}
export type ApplyWorkItemEventResult = { kind: "deduplicated"; item: WorkItem } | { kind: "transitioned"; item: WorkItem; transition: StateTransitionRecord };
export interface HumanTransitionCapability {
  id: string; loopId: string; workItemId: string; processVersion: number; fromState: string; expectedRevision: number;
  event: string; action: string | null; gateId: string; idempotencyKey: string; payloadDigest: string;
  issuedAt: string; expiresAt: string;
}
export interface WorkItemCasMutation {
  loopId: string; workItemId: string; processVersion: number; idempotencyKey: string; fromState: string;
  expectedRevision: number; payloadDigest: string; nextItem: WorkItem; transition: StateTransitionRecord;
}
export type WorkItemCasMutationResult = { kind: "applied" } | { kind: "deduplicated"; item: WorkItem } | { kind: "collision" } | { kind: "conflict"; actualRevision: number };
export interface WorkItemMutationStore { mutate(input: WorkItemCasMutation): Promise<WorkItemCasMutationResult> }
export interface HumanTransitionCapabilityResolver {
  consume(
    id: string,
    expectedEnvelope: Omit<HumanTransitionCapability, "id" | "issuedAt" | "expiresAt">,
    hostNow: string,
    casMutation: () => Promise<WorkItemCasMutationResult>,
  ): Promise<{ capability: HumanTransitionCapability; mutation: WorkItemCasMutationResult } | null>;
}
export interface WorkItemAuthority { store: WorkItemMutationStore; now?: () => Date; humanCapabilityId?: string; humanCapabilities?: HumanTransitionCapabilityResolver }

export function workItemEventDigest(eventInput: WorkItemEvent): string {
  const event = WorkItemEventSchema.parse(eventInput);
  return createHash("sha256").update(JSON.stringify({ event: event.event, actor: event.actor, callerTimestamp: event.occurredAt })).digest("hex");
}
function findState(process: ProcessDefinition, stateId: string): ProcessState {
  const state = process.states.find((candidate) => candidate.id === stateId);
  if (state === undefined) throw new InvalidWorkItemTransitionError(`Unknown process state: ${stateId}`);
  return state;
}
function statusFor(state: ProcessState): WorkItem["status"] { return state.type === "terminal" ? "completed" : state.type; }
function deadlineFor(state: ProcessState, occurredAt: string): string | null {
  if (state.slaHours === undefined) return null;
  return new Date(Date.parse(occurredAt) + state.slaHours * 3_600_000).toISOString();
}
export function createWorkItem(processInput: ProcessDefinition, input: CreateWorkItemInput): WorkItem {
  const process = ProcessDefinitionSchema.parse(processInput);
  if (input.loopId !== process.loopId) throw new InvalidWorkItemTransitionError(`Work item loop ${input.loopId} does not match process loop ${process.loopId}`);
  const initial = findState(process, process.initialState);
  return WorkItemSchema.parse({
    id: input.id, loopId: input.loopId, processVersion: process.version, currentState: initial.id, status: statusFor(initial), revision: 0,
    externalReferences: input.externalReferences ?? {}, missingInputs: input.missingInputs ?? [], pendingGate: null,
    deadline: deadlineFor(initial, input.eventAt), nextCheckAt: null, createdAt: input.eventAt, updatedAt: input.eventAt,
  });
}
function handleMutation(result: WorkItemCasMutationResult, event: WorkItemEvent, nextItem: WorkItem, transition: StateTransitionRecord): ApplyWorkItemEventResult {
  if (result.kind === "collision") throw new InvalidWorkItemTransitionError(`Idempotency collision for ${event.idempotencyKey}`);
  if (result.kind === "conflict") throw new WorkItemRevisionConflictError(event.expectedRevision, result.actualRevision);
  if (result.kind === "deduplicated") return { kind: "deduplicated", item: WorkItemSchema.parse(result.item) };
  return { kind: "transitioned", item: nextItem, transition };
}
export async function applyWorkItemEvent(
  processInput: ProcessDefinition, itemInput: WorkItem, eventInput: WorkItemEvent, authority: WorkItemAuthority,
): Promise<ApplyWorkItemEventResult> {
  if (authority?.store === undefined || typeof authority.store.mutate !== "function") throw new InvalidWorkItemTransitionError("A host-injected durable mutation authority/store is required");
  const process = ProcessDefinitionSchema.parse(processInput); const item = WorkItemSchema.parse(itemInput); const event = WorkItemEventSchema.parse(eventInput);
  if (item.loopId !== process.loopId || item.processVersion !== process.version) throw new InvalidWorkItemTransitionError("Work item does not belong to this process version");
  if (event.expectedRevision !== item.revision) throw new WorkItemRevisionConflictError(event.expectedRevision, item.revision);
  const transitionDefinition = process.transitions.find((candidate) => candidate.from === item.currentState && candidate.event === event.event && candidate.actor === event.actor);
  if (transitionDefinition === undefined) throw new InvalidWorkItemTransitionError(`No ${event.actor} transition for ${event.event} from ${item.currentState}`);
  const now = (authority.now ?? (() => new Date()))(); const nowMs = now.getTime();
  if (!Number.isFinite(nowMs)) throw new InvalidWorkItemTransitionError("Host clock returned an invalid time");
  const occurredAt = now.toISOString(); const payloadDigest = workItemEventDigest(event);
  const capabilityId = event.actor === "human" ? authority.humanCapabilityId ?? null : null;
  if (event.actor !== "human" && (authority.humanCapabilityId !== undefined || authority.humanCapabilities !== undefined)) throw new InvalidWorkItemTransitionError("Human capability cannot authorize a non-human transition");
  if (event.actor === "human" && (capabilityId === null || authority.humanCapabilities === undefined)) throw new InvalidWorkItemTransitionError("Human transition requires an opaque host capability resolver");
  const nextState = findState(process, transitionDefinition.to); const resultingRevision = item.revision + 1;
  const nextItem = WorkItemSchema.parse({ ...item, currentState: nextState.id, status: statusFor(nextState), revision: resultingRevision,
    pendingGate: transitionDefinition.gateId ?? null, deadline: deadlineFor(nextState, occurredAt), nextCheckAt: null, updatedAt: occurredAt });
  const transition: StateTransitionRecord = {
    workItemId: item.id, loopId: item.loopId, from: item.currentState, to: nextState.id, event: event.event, actor: event.actor,
    occurredAt, idempotencyKey: event.idempotencyKey, action: transitionDefinition.action ?? null, gateId: transitionDefinition.gateId ?? null,
    resultingRevision, authorizedGateId: event.actor === "human" ? item.pendingGate : null, capabilityId, payloadDigest,
  };
  const mutation: WorkItemCasMutation = { loopId: item.loopId, workItemId: item.id, processVersion: item.processVersion,
    idempotencyKey: event.idempotencyKey, fromState: item.currentState, expectedRevision: event.expectedRevision, payloadDigest, nextItem, transition };
  if (event.actor !== "human") return handleMutation(await authority.store.mutate(mutation), event, nextItem, transition);
  const expected = {
    loopId: item.loopId, workItemId: item.id, processVersion: item.processVersion, fromState: item.currentState,
    expectedRevision: event.expectedRevision, event: event.event, action: transitionDefinition.action ?? null,
    gateId: item.pendingGate!, idempotencyKey: event.idempotencyKey, payloadDigest,
  };
  const atomic = await authority.humanCapabilities!.consume(capabilityId!, expected, now.toISOString(), () => authority.store.mutate(mutation));
  if (atomic === null || typeof atomic !== "object" || atomic.capability === null
    || typeof atomic.capability !== "object" || atomic.mutation === null || typeof atomic.mutation !== "object") {
    throw new InvalidWorkItemTransitionError("Human capability is missing, expired, replayed, or does not match the exact transition");
  }
  const issuedAt = Date.parse(atomic.capability.issuedAt); const expiresAt = Date.parse(atomic.capability.expiresAt);
  const returnedEnvelope = {
    loopId: atomic.capability.loopId, workItemId: atomic.capability.workItemId,
    processVersion: atomic.capability.processVersion, fromState: atomic.capability.fromState,
    expectedRevision: atomic.capability.expectedRevision, event: atomic.capability.event,
    action: atomic.capability.action, gateId: atomic.capability.gateId,
    idempotencyKey: atomic.capability.idempotencyKey, payloadDigest: atomic.capability.payloadDigest,
  };
  if (atomic.capability.id !== capabilityId || JSON.stringify(returnedEnvelope) !== JSON.stringify(expected)
    || !Number.isFinite(issuedAt) || !Number.isFinite(expiresAt) || issuedAt > nowMs || expiresAt <= nowMs
    || !["applied", "deduplicated", "collision", "conflict"].includes((atomic.mutation as { kind?: string }).kind ?? "")) {
    throw new InvalidWorkItemTransitionError("Human capability resolver returned invalid trust");
  }
  return handleMutation(atomic.mutation, event, nextItem, transition);
}

export { FilesystemWorkItemMutationStore } from "./filesystem-work-item-mutation-store.js";
