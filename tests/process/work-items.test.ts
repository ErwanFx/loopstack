import { readFileSync } from "node:fs";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parse } from "yaml";
import { describe, expect, it } from "vitest";
import { ProcessDefinitionSchema } from "../../src/process/schemas.js";
import {
  InvalidWorkItemTransitionError,
  WorkItemRevisionConflictError,
  applyWorkItemEvent,
  createWorkItem,
  FilesystemWorkItemMutationStore,
  workItemEventDigest,
  type HumanTransitionCapability,
  type HumanTransitionCapabilityResolver,
  type WorkItemCasMutation,
  type WorkItemMutationStore,
} from "../../src/process/work-items.js";
import type { WorkItem } from "../../src/process/schemas.js";

const process = ProcessDefinitionSchema.parse(parse(readFileSync("tests/fixtures/v3/pv-admin/process.yaml", "utf8")));

class MemoryMutationStore implements WorkItemMutationStore {
  private records = new Map<string, { fromState: string; expectedRevision: number; occurrence: number; payloadDigest: string; item: WorkItem }>();
  constructor(private current: WorkItem) {}
  async mutate(input: WorkItemCasMutation) {
    const key = `${input.loopId}:${input.workItemId}:${input.processVersion}:${input.idempotencyKey}`;
    const seen = this.records.get(key);
    if (seen !== undefined) {
      if (seen.fromState !== input.fromState || seen.expectedRevision !== input.expectedRevision
        || seen.occurrence !== input.transition.resultingRevision || seen.payloadDigest !== input.payloadDigest) return { kind: "collision" as const };
      return { kind: "deduplicated" as const, item: structuredClone(seen.item) };
    }
    if (this.current.revision !== input.expectedRevision || this.current.currentState !== input.fromState) {
      return { kind: "conflict" as const, actualRevision: this.current.revision };
    }
    this.current = structuredClone(input.nextItem);
    this.records.set(key, { fromState: input.fromState, expectedRevision: input.expectedRevision,
      occurrence: input.transition.resultingRevision, payloadDigest: input.payloadDigest, item: this.current });
    return { kind: "applied" as const };
  }
}

function item(id = "dossier-client-123") {
  return createWorkItem(process, { id, loopId: "pv-admin", eventAt: "2026-08-04T08:00:00.000Z" });
}
const hostNow = () => new Date("2026-08-04T10:00:00.000Z");
function authority(current: WorkItem, extras: Partial<Parameters<typeof applyWorkItemEvent>[3]> = {}) {
  return { store: new MemoryMutationStore(current), now: hostNow, ...extras };
}

function oneShot(capability: HumanTransitionCapability): HumanTransitionCapabilityResolver {
  let used = false;
  return { async consume(id, expected, hostNow, casMutation) {
    const envelope = Object.fromEntries(Object.entries(capability)
      .filter(([key]) => !["id", "issuedAt", "expiresAt"].includes(key)));
    const nowMs = Date.parse(hostNow);
    if (used || id !== capability.id || JSON.stringify(envelope) !== JSON.stringify(expected)
      || !Number.isFinite(nowMs) || Date.parse(capability.issuedAt) > nowMs
      || Date.parse(capability.expiresAt) <= nowMs) return null;
    used = true;
    return { capability, mutation: await casMutation() };
  } };
}

describe("resumable work items with durable authority", () => {
  it("applies a transition through durable CAS and uses the host clock", async () => {
    const created = item();
    const result = await applyWorkItemEvent(process, created, {
      event: "dossier.complete", actor: "agent", occurredAt: "2099-01-01T00:00:00.000Z",
      idempotencyKey: "complete:1", expectedRevision: 0,
    }, authority(created));
    expect(result.item).toMatchObject({
      currentState: "awaiting-mairie-approval", revision: 1,
      pendingGate: "approve-mairie-submission", updatedAt: "2026-08-04T10:00:00.000Z",
      deadline: "2026-08-06T10:00:00.000Z",
    });
    expect(result.transition.occurredAt).toBe("2026-08-04T10:00:00.000Z");
  });

  it("input alone cannot authorize a transition because a CAS authority is mandatory", async () => {
    const created = item();
    await expect(applyWorkItemEvent(process, created, {
      event: "dossier.complete", actor: "agent", occurredAt: "2026-08-04T09:00:00.000Z",
      idempotencyKey: "complete:1", expectedRevision: 0,
    }, undefined as never)).rejects.toThrow(/authority|store/i);
  });

  it("resolves and consumes an opaque human capability bound to the exact transition", async () => {
    const created = item();
    const store = new MemoryMutationStore(created);
    const waiting = (await applyWorkItemEvent(process, created, {
      event: "dossier.complete", actor: "agent", occurredAt: "2099-01-01T00:00:00.000Z",
      idempotencyKey: "complete:1", expectedRevision: 0,
    }, { store, now: hostNow })).item;
    const capability: HumanTransitionCapability = {
      id: "human-capability-1", loopId: waiting.loopId, workItemId: waiting.id,
      processVersion: waiting.processVersion, fromState: waiting.currentState,
      expectedRevision: 1,
      event: "approval.approved", action: "submit-mairie", gateId: "approve-mairie-submission",
      idempotencyKey: "approval:1",
      payloadDigest: workItemEventDigest({ event: "approval.approved", actor: "human", occurredAt: "2099-01-01T00:00:00.000Z", idempotencyKey: "approval:1", expectedRevision: 1 }),
      issuedAt: "2026-08-04T09:30:00.000Z", expiresAt: "2026-08-04T10:30:00.000Z",
    };
    const resolver = oneShot(capability);
    const resumed = await applyWorkItemEvent(process, waiting, {
      event: "approval.approved", actor: "human", occurredAt: "2099-01-01T00:00:00.000Z",
      idempotencyKey: "approval:1", expectedRevision: 1,
    }, { store, now: hostNow, humanCapabilityId: capability.id, humanCapabilities: resolver });
    expect(resumed.transition).toMatchObject({ capabilityId: capability.id, authorizedGateId: capability.gateId });
    await expect(applyWorkItemEvent(process, waiting, {
      event: "approval.approved", actor: "human", occurredAt: "2099-01-01T00:00:00.000Z",
      idempotencyKey: "approval:2", expectedRevision: 1,
    }, { store, now: hostNow, humanCapabilityId: capability.id, humanCapabilities: resolver }))
      .rejects.toThrow(/capability/i);
  });

  it("rejects caller-authored/mismatched/expired human authority", async () => {
    const created = item();
    const firstStore = new MemoryMutationStore(created);
    const waiting = (await applyWorkItemEvent(process, created, {
      event: "dossier.complete", actor: "agent", occurredAt: "2099-01-01T00:00:00.000Z", idempotencyKey: "complete:1", expectedRevision: 0,
    }, { store: firstStore, now: hostNow })).item;
    const exact: HumanTransitionCapability = {
      id: "cap-1", loopId: waiting.loopId, workItemId: waiting.id, processVersion: waiting.processVersion,
      fromState: waiting.currentState, expectedRevision: 1, event: "approval.approved", action: "submit-mairie",
      gateId: "approve-mairie-submission", issuedAt: "2026-08-04T09:00:00.000Z", expiresAt: "2026-08-04T11:00:00.000Z",
      idempotencyKey: "approval:approve-mairie-submission",
      payloadDigest: workItemEventDigest({ event: "approval.approved", actor: "human", occurredAt: "2099-01-01T00:00:00.000Z", idempotencyKey: "approval:approve-mairie-submission", expectedRevision: 1 }),
    };
    for (const mismatch of [
      { ...exact, loopId: "other-loop" }, { ...exact, workItemId: "other-item" },
      { ...exact, processVersion: 999 }, { ...exact, fromState: "other-state" },
      { ...exact, event: "approval.rejected" }, { ...exact, action: null },
      { ...exact, gateId: "other-gate" }, { ...exact, expiresAt: "2026-08-04T10:00:00.000Z" },
    ]) {
      await expect(applyWorkItemEvent(process, waiting, {
        event: "approval.approved", actor: "human", occurredAt: "2099-01-01T00:00:00.000Z", idempotencyKey: `approval:${mismatch.gateId}`,
        expectedRevision: 1,
      }, { store: new MemoryMutationStore(waiting), now: hostNow, humanCapabilityId: mismatch.id, humanCapabilities: oneShot(mismatch) }))
        .rejects.toThrow(/capability/i);
    }
  });

  it("durably binds idempotency to loop/item/process/key/from-state/payload and rejects collisions", async () => {
    const created = item();
    const store = new MemoryMutationStore(created);
    const event = { event: "dossier.complete", actor: "agent" as const, occurredAt: "2099-01-01T00:00:00.000Z", idempotencyKey: "shared-key", expectedRevision: 0 };
    const applied = await applyWorkItemEvent(process, created, event, { store, now: hostNow });
    const replay = await applyWorkItemEvent(process, created, event, { store, now: hostNow });
    expect(replay).toEqual({ kind: "deduplicated", item: applied.item });
    await expect(applyWorkItemEvent(process, created, {
      ...event, occurredAt: "2099-01-01T00:00:01.000Z",
    }, { store, now: hostNow }))
      .rejects.toThrow(/collision/i);

    const other = item("dossier-client-456");
    const otherResult = await applyWorkItemEvent(process, other, event, authority(other));
    expect(otherResult.item.id).toBe(other.id);
  });

  it("refuses concurrent stale transitions through store CAS", async () => {
    const created = item();
    const store = new MemoryMutationStore(created);
    await applyWorkItemEvent(process, created, {
      event: "dossier.complete", actor: "agent", occurredAt: "2099-01-01T00:00:00.000Z", idempotencyKey: "winner", expectedRevision: 0,
    }, { store, now: hostNow });
    await expect(applyWorkItemEvent(process, created, {
      event: "dossier.complete", actor: "agent", occurredAt: "2099-01-01T00:00:00.000Z", idempotencyKey: "loser", expectedRevision: 0,
    }, { store, now: hostNow })).rejects.toThrow(WorkItemRevisionConflictError);
  });

  it("persists production work-item CAS transitions in the filesystem store", async () => {
    const created = item();
    const root = await mkdtemp(join(tmpdir(), "loopstack-work-items-"));
    const store = new FilesystemWorkItemMutationStore(root, hostNow);
    await store.initialize(created);
    const event = {
      event: "dossier.complete", actor: "agent" as const, occurredAt: "2099-01-01T00:00:00.000Z",
      idempotencyKey: "filesystem:complete:1", expectedRevision: 0,
    };
    const applied = await applyWorkItemEvent(process, created, event, { store, now: hostNow });
    expect(await store.load(created.loopId, created.id)).toEqual(applied.item);
    const replay = await applyWorkItemEvent(process, created, event, { store, now: hostNow });
    expect(replay).toEqual({ kind: "deduplicated", item: applied.item });
  });

  it("rejects reuse of the same filesystem idempotency key at a later state occurrence", async () => {
    const cyclic = ProcessDefinitionSchema.parse({
      schemaVersion: 1, loopId: "cyclic-loop", version: 1, kind: "control-loop",
      workItem: { entityName: "cyclic-item", idField: "id" }, initialState: "ready",
      states: [{ id: "ready", type: "active" }, { id: "away", type: "active" }],
      transitions: [
        { from: "ready", to: "away", event: "advance", actor: "agent" },
        { from: "away", to: "ready", event: "reset", actor: "agent" },
      ],
    });
    const created = createWorkItem(cyclic, { id: "cyclic-item", loopId: "cyclic-loop", eventAt: "2026-08-04T08:00:00.000Z" });
    const root = await mkdtemp(join(tmpdir(), "loopstack-work-item-occurrence-"));
    const store = new FilesystemWorkItemMutationStore(root, hostNow);
    await store.initialize(created);
    const first = await applyWorkItemEvent(cyclic, created, {
      event: "advance", actor: "agent", occurredAt: "2099-01-01T00:00:00.000Z", idempotencyKey: "cycle-key", expectedRevision: 0,
    }, { store, now: hostNow });
    const reset = await applyWorkItemEvent(cyclic, first.item, {
      event: "reset", actor: "agent", occurredAt: "2099-01-01T00:00:00.000Z", idempotencyKey: "reset-key", expectedRevision: 1,
    }, { store, now: hostNow });
    await expect(applyWorkItemEvent(cyclic, reset.item, {
      event: "advance", actor: "agent", occurredAt: "2099-01-01T00:00:00.000Z", idempotencyKey: "cycle-key", expectedRevision: 2,
    }, { store, now: hostNow })).rejects.toThrow(/collision/i);
  });

  it("does not reclaim an expired filesystem work-item lock while its owner process is alive", async () => {
    const root = await mkdtemp(join(tmpdir(), "loopstack-work-item-fence-"));
    let hostNowValue = new Date("2026-08-04T10:00:00.000Z");
    let releaseA!: () => void;
    const pausedA = new Promise<void>((resolve) => { releaseA = resolve; });
    let reachedBarrier!: () => void;
    const barrierReached = new Promise<void>((resolve) => { reachedBarrier = resolve; });
    class PausedStore extends FilesystemWorkItemMutationStore {
      protected async beforeCommit(): Promise<void> { reachedBarrier(); await pausedA; }
    }
    const staleItem = item("stale-writer");
    const liveWrite = new PausedStore(root, () => hostNowValue, 10).initialize(staleItem);
    await barrierReached;
    hostNowValue = new Date("2026-08-04T10:00:01.000Z");
    let contenderSettled = false;
    const contender = new FilesystemWorkItemMutationStore(root, () => hostNowValue, 10)
      .initialize({ ...staleItem, externalReferences: { contender: "ref-1" } })
      .finally(() => { contenderSettled = true; });
    await new Promise((resolve) => setTimeout(resolve, 25));
    expect(contenderSettled).toBe(false);
    releaseA();
    await liveWrite;
    await expect(contender).rejects.toThrow(/initialized|different/i);
    expect(await new FilesystemWorkItemMutationStore(root).load(staleItem.loopId, staleItem.id)).toEqual(staleItem);
  });

  it("reclaims a filesystem work-item lock whose owner process is definitively dead", async () => {
    const root = await mkdtemp(join(tmpdir(), "loopstack-work-item-dead-lock-"));
    const created = item("dead-owner");
    const directory = join(root, created.loopId);
    await import("node:fs/promises").then(({ mkdir }) => mkdir(directory, { recursive: true }));
    const bootId = (await readFile("/proc/sys/kernel/random/boot_id", "utf8")).trim();
    await writeFile(join(directory, `${created.id}.json.lock`), JSON.stringify({
      token: "00000000-0000-4000-8000-000000000002", ownerId: "crashed-runner",
      pid: 2_147_483_647, bootId, generation: 1,
      createdAt: "2026-08-04T10:00:00.000Z", leaseUntil: "2026-08-04T10:00:00.010Z",
    }));
    const store = new FilesystemWorkItemMutationStore(root, () => new Date("2026-08-04T10:00:01.000Z"), 10);
    await store.initialize(created);
    expect(await store.load(created.loopId, created.id)).toEqual(created);
  });

  it("fsyncs work-item state and every lock directory transition in durability order", async () => {
    const root = await mkdtemp(join(tmpdir(), "loopstack-work-item-fsync-"));
    const events: string[] = [];
    const store = new FilesystemWorkItemMutationStore(root, hostNow, 5_000, (event) => events.push(event));
    await store.initialize(item("fsync-item"));
    expect(events).toEqual(["lock-create-dir", "state-temp-file", "state-rename-dir", "lock-remove-dir"]);
  });

  it("rejects invalid state/actor and unsafe process definitions", async () => {
    const created = item();
    await expect(applyWorkItemEvent(process, created, {
      event: "mairie.accepted", actor: "external", occurredAt: "2099-01-01T00:00:00.000Z", idempotencyKey: "bad", expectedRevision: 0,
    }, authority(created))).rejects.toThrow(InvalidWorkItemTransitionError);
    expect(() => ProcessDefinitionSchema.parse({ ...process, transitions: [...process.transitions, { ...process.transitions[0] }] }))
      .toThrow(/ambiguous/i);
  });
});
