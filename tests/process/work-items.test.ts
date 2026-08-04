import { readFileSync } from "node:fs";
import { parse } from "yaml";
import { describe, expect, it } from "vitest";
import { ProcessDefinitionSchema } from "../../src/process/schemas.js";
import {
  InvalidWorkItemTransitionError,
  WorkItemRevisionConflictError,
  applyWorkItemEvent,
  createWorkItem,
} from "../../src/process/work-items.js";

const process = ProcessDefinitionSchema.parse(parse(
  readFileSync("tests/fixtures/v3/pv-admin/process.yaml", "utf8"),
));

describe("resumable work items", () => {
  it("creates a work item and moves it into a gated human wait", () => {
    const created = createWorkItem(process, {
      id: "dossier-client-123",
      loopId: "pv-admin",
      eventAt: "2026-08-04T08:00:00.000Z",
    });
    expect(created).toMatchObject({
      currentState: "collecting-documents",
      status: "active",
      revision: 0,
      pendingGate: null,
    });

    const result = applyWorkItemEvent(process, created, {
      event: "dossier.complete",
      actor: "agent",
      occurredAt: "2026-08-04T09:00:00.000Z",
      idempotencyKey: "dossier-client-123:complete:1",
      expectedRevision: 0,
    }, new Set());

    expect(result.kind).toBe("transitioned");
    expect(result.item).toMatchObject({
      currentState: "awaiting-mairie-approval",
      status: "waiting-human",
      revision: 1,
      pendingGate: "approve-mairie-submission",
      deadline: "2026-08-06T09:00:00.000Z",
    });
    expect(result.transition).toMatchObject({
      from: "collecting-documents",
      to: "awaiting-mairie-approval",
      event: "dossier.complete",
      actor: "agent",
      resultingRevision: 1,
    });
  });

  it("resumes after human approval and clears the pending gate", () => {
    const created = createWorkItem(process, {
      id: "dossier-client-123",
      loopId: "pv-admin",
      eventAt: "2026-08-04T08:00:00.000Z",
    });
    const waiting = applyWorkItemEvent(process, created, {
      event: "dossier.complete",
      actor: "agent",
      occurredAt: "2026-08-04T09:00:00.000Z",
      idempotencyKey: "complete:1",
      expectedRevision: 0,
    }, new Set()).item;
    const resumed = applyWorkItemEvent(process, waiting, {
      event: "approval.approved",
      actor: "human",
      occurredAt: "2026-08-04T10:00:00.000Z",
      idempotencyKey: "approval:1",
      expectedRevision: 1,
    }, new Set(["complete:1"]));

    expect(resumed.item).toMatchObject({
      currentState: "awaiting-mairie",
      status: "waiting-external",
      revision: 2,
      pendingGate: null,
      deadline: "2026-09-03T10:00:00.000Z",
    });
  });

  it("deduplicates a previously applied event without changing the item", () => {
    const created = createWorkItem(process, {
      id: "dossier-client-123",
      loopId: "pv-admin",
      eventAt: "2026-08-04T08:00:00.000Z",
    });
    const duplicate = applyWorkItemEvent(process, created, {
      event: "dossier.complete",
      actor: "agent",
      occurredAt: "2026-08-04T09:00:00.000Z",
      idempotencyKey: "complete:1",
      expectedRevision: 99,
    }, new Set(["complete:1"]));

    expect(duplicate).toEqual({ kind: "deduplicated", item: created });
  });

  it("rejects events from an invalid state or actor", () => {
    const created = createWorkItem(process, {
      id: "dossier-client-123",
      loopId: "pv-admin",
      eventAt: "2026-08-04T08:00:00.000Z",
    });
    expect(() => applyWorkItemEvent(process, created, {
      event: "mairie.accepted",
      actor: "external",
      occurredAt: "2026-08-04T09:00:00.000Z",
      idempotencyKey: "mairie:1",
      expectedRevision: 0,
    }, new Set())).toThrow(InvalidWorkItemTransitionError);
    expect(() => applyWorkItemEvent(process, created, {
      event: "dossier.complete",
      actor: "human",
      occurredAt: "2026-08-04T09:00:00.000Z",
      idempotencyKey: "complete:1",
      expectedRevision: 0,
    }, new Set())).toThrow(InvalidWorkItemTransitionError);
  });

  it("fails closed when the expected revision is stale", () => {
    const created = createWorkItem(process, {
      id: "dossier-client-123",
      loopId: "pv-admin",
      eventAt: "2026-08-04T08:00:00.000Z",
    });
    expect(() => applyWorkItemEvent(process, created, {
      event: "dossier.complete",
      actor: "agent",
      occurredAt: "2026-08-04T09:00:00.000Z",
      idempotencyKey: "complete:1",
      expectedRevision: 1,
    }, new Set())).toThrow(WorkItemRevisionConflictError);
  });
});

describe("process definition safety", () => {
  it("rejects terminal outgoing transitions", () => {
    expect(() => ProcessDefinitionSchema.parse({
      ...process,
      transitions: [...process.transitions, {
        from: "completed",
        event: "dossier.reopened",
        to: "collecting-documents",
        actor: "human",
      }],
    })).toThrow(/terminal/i);
  });

  it("requires an SLA or explicit exemption for every waiting state", () => {
    expect(() => ProcessDefinitionSchema.parse({
      ...process,
      states: process.states.map((state) => state.id === "awaiting-mairie"
        ? { id: state.id, type: state.type }
        : state),
    })).toThrow(/SLA/i);
  });

  it("rejects missing transition targets and gate references", () => {
    expect(() => ProcessDefinitionSchema.parse({
      ...process,
      transitions: [{
        from: "collecting-documents",
        event: "dossier.complete",
        to: "missing-state",
        actor: "agent",
      }],
    })).toThrow(/state/i);
    expect(() => ProcessDefinitionSchema.parse({
      ...process,
      transitions: [{
        ...process.transitions[0],
        gateId: "missing-gate",
      }],
    })).toThrow(/gate/i);
  });
});
