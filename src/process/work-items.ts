import {
  ProcessDefinitionSchema,
  WorkItemEventSchema,
  WorkItemSchema,
  type ProcessDefinition,
  type ProcessState,
  type WorkItem,
  type WorkItemEvent,
} from "./schemas.js";

export class InvalidWorkItemTransitionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidWorkItemTransitionError";
  }
}

export class WorkItemRevisionConflictError extends Error {
  constructor(expected: number, actual: number) {
    super(`Expected work-item revision ${expected}, received ${actual}`);
    this.name = "WorkItemRevisionConflictError";
  }
}

export interface CreateWorkItemInput {
  id: string;
  loopId: string;
  eventAt: string;
  externalReferences?: Record<string, string>;
  missingInputs?: string[];
}

export interface StateTransitionRecord {
  workItemId: string;
  loopId: string;
  from: string;
  to: string;
  event: string;
  actor: WorkItemEvent["actor"];
  occurredAt: string;
  idempotencyKey: string;
  action: string | null;
  gateId: string | null;
  resultingRevision: number;
}

export type ApplyWorkItemEventResult =
  | { kind: "deduplicated"; item: WorkItem }
  | { kind: "transitioned"; item: WorkItem; transition: StateTransitionRecord };

function findState(process: ProcessDefinition, stateId: string): ProcessState {
  const state = process.states.find((candidate) => candidate.id === stateId);
  if (state === undefined) {
    throw new InvalidWorkItemTransitionError(`Unknown process state: ${stateId}`);
  }
  return state;
}

function statusFor(state: ProcessState): WorkItem["status"] {
  if (state.type === "terminal") return "completed";
  return state.type;
}

function deadlineFor(state: ProcessState, occurredAt: string): string | null {
  if (state.slaHours === undefined) return null;
  return new Date(new Date(occurredAt).getTime() + state.slaHours * 60 * 60 * 1000).toISOString();
}

export function createWorkItem(processInput: ProcessDefinition, input: CreateWorkItemInput): WorkItem {
  const process = ProcessDefinitionSchema.parse(processInput);
  if (input.loopId !== process.loopId) {
    throw new InvalidWorkItemTransitionError(
      `Work item loop ${input.loopId} does not match process loop ${process.loopId}`,
    );
  }
  const initial = findState(process, process.initialState);
  return WorkItemSchema.parse({
    id: input.id,
    loopId: input.loopId,
    processVersion: process.version,
    currentState: initial.id,
    status: statusFor(initial),
    revision: 0,
    externalReferences: input.externalReferences ?? {},
    missingInputs: input.missingInputs ?? [],
    pendingGate: null,
    deadline: deadlineFor(initial, input.eventAt),
    nextCheckAt: null,
    createdAt: input.eventAt,
    updatedAt: input.eventAt,
  });
}

export function applyWorkItemEvent(
  processInput: ProcessDefinition,
  itemInput: WorkItem,
  eventInput: WorkItemEvent,
  seenIdempotencyKeys: ReadonlySet<string>,
): ApplyWorkItemEventResult {
  const process = ProcessDefinitionSchema.parse(processInput);
  const item = WorkItemSchema.parse(itemInput);
  const event = WorkItemEventSchema.parse(eventInput);

  if (seenIdempotencyKeys.has(event.idempotencyKey)) {
    return { kind: "deduplicated", item };
  }
  if (event.expectedRevision !== item.revision) {
    throw new WorkItemRevisionConflictError(event.expectedRevision, item.revision);
  }
  if (item.loopId !== process.loopId || item.processVersion !== process.version) {
    throw new InvalidWorkItemTransitionError("Work item does not belong to this process version");
  }

  const transition = process.transitions.find((candidate) =>
    candidate.from === item.currentState
    && candidate.event === event.event
    && candidate.actor === event.actor);
  if (transition === undefined) {
    throw new InvalidWorkItemTransitionError(
      `No ${event.actor} transition for ${event.event} from ${item.currentState}`,
    );
  }

  const nextState = findState(process, transition.to);
  const resultingRevision = item.revision + 1;
  const updated = WorkItemSchema.parse({
    ...item,
    currentState: nextState.id,
    status: statusFor(nextState),
    revision: resultingRevision,
    pendingGate: transition.gateId ?? null,
    deadline: deadlineFor(nextState, event.occurredAt),
    nextCheckAt: null,
    updatedAt: event.occurredAt,
  });

  return {
    kind: "transitioned",
    item: updated,
    transition: {
      workItemId: item.id,
      loopId: item.loopId,
      from: item.currentState,
      to: nextState.id,
      event: event.event,
      actor: event.actor,
      occurredAt: event.occurredAt,
      idempotencyKey: event.idempotencyKey,
      action: transition.action ?? null,
      gateId: transition.gateId ?? null,
      resultingRevision,
    },
  };
}
