import { randomUUID } from "node:crypto";
import { mkdir, open, readFile, rename, rm } from "node:fs/promises";
import { dirname, join } from "node:path";
import { z } from "zod";
import { WorkItemSchema, type WorkItem } from "./schemas.js";
import type { WorkItemCasMutation, WorkItemCasMutationResult, WorkItemMutationStore } from "./work-items.js";

const recordSchema = z.object({
  fromState: z.string().min(1), expectedRevision: z.number().int().nonnegative(),
  occurrence: z.number().int().positive(), payloadDigest: z.string().regex(/^[a-f0-9]{64}$/),
  item: WorkItemSchema,
}).strict();
const stateSchema = z.object({ item: WorkItemSchema, records: z.record(z.string(), recordSchema), fencingGeneration: z.number().int().nonnegative() }).strict();
type DurableState = z.infer<typeof stateSchema>;
const lockSchema = z.object({ token: z.string().uuid(), ownerId: z.string().min(1), pid: z.number().int().positive(), bootId: z.string().uuid(), generation: z.number().int().positive(), createdAt: z.iso.datetime(), leaseUntil: z.iso.datetime() }).strict();
type Lock = { path: string; token: string; pid: number; bootId: string; generation: number };

export class FilesystemWorkItemMutationStore implements WorkItemMutationStore {
  private bootId: string | null = null;
  constructor(private readonly root: string, private readonly now: () => Date = () => new Date(), private readonly lockLeaseMs = 5_000,
    private readonly durabilityObserver: (event: string) => void = () => undefined) {}
  private path(loopId: string, workItemId: string): string {
    if (!/^[A-Za-z0-9._-]+$/.test(loopId) || !/^[A-Za-z0-9._-]+$/.test(workItemId)) throw new Error("Unsafe work-item identity");
    return join(this.root, loopId, `${workItemId}.json`);
  }
  protected async beforeCommit(): Promise<void> {}
  private async currentBootId(): Promise<string> {
    if (this.bootId === null) this.bootId = (await readFile("/proc/sys/kernel/random/boot_id", "utf8")).trim();
    return z.string().uuid().parse(this.bootId);
  }
  private ownerIsAlive(lock: z.infer<typeof lockSchema>, bootId: string): boolean {
    if (lock.bootId !== bootId) return false;
    try { process.kill(lock.pid, 0); return true; }
    catch (error) { return (error as NodeJS.ErrnoException).code !== "ESRCH"; }
  }
  private async syncParent(path: string, event: string): Promise<void> {
    const directory = await open(dirname(path), "r");
    try { await directory.sync(); } finally { await directory.close(); }
    this.durabilityObserver(event);
  }
  private async createDurable(path: string, content: string): Promise<void> {
    const file = await open(path, "wx", 0o600);
    try { await file.writeFile(content); await file.sync(); } finally { await file.close(); }
  }
  private async write(path: string, state: DurableState, lock: Lock): Promise<void> {
    const valid = stateSchema.parse(state); await mkdir(dirname(path), { recursive: true });
    if (valid.fencingGeneration !== lock.generation) throw new Error("Fencing generation mismatch");
    const temporary = `${path}.${process.pid}.${randomUUID()}.tmp`;
    try {
      await this.createDurable(temporary, JSON.stringify(valid));
      this.durabilityObserver("state-temp-file");
      await this.beforeCommit();
      const currentLock = lockSchema.parse(JSON.parse(await readFile(lock.path, "utf8")));
      if (currentLock.token !== lock.token || currentLock.generation !== lock.generation
        || currentLock.pid !== lock.pid || currentLock.bootId !== lock.bootId) throw new Error("Stale filesystem lock owner");
      try {
        const currentState = await this.read(path);
        if (currentState.fencingGeneration > lock.generation) throw new Error("Stale fencing generation");
      } catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
      await rename(temporary, path);
      await this.syncParent(path, "state-rename-dir");
    } catch (error) { await rm(temporary, { force: true }); throw error; }
  }
  private async read(path: string): Promise<DurableState> { return stateSchema.parse(JSON.parse(await readFile(path, "utf8"))); }
  private async acquire(path: string): Promise<Lock> {
    const lockPath = `${path}.lock`; await mkdir(dirname(lockPath), { recursive: true });
    const bootId = await this.currentBootId();
    let generationFloor = 1;
    for (let attempt = 0; attempt < 400; attempt += 1) {
      const nowMs = this.now().getTime(); const token = randomUUID();
      let persistedGeneration = 0;
      try { persistedGeneration = (await this.read(path)).fencingGeneration; } catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
      const generation = Math.max(generationFloor, persistedGeneration + 1);
      const metadata = { token, ownerId: `${process.pid}`, pid: process.pid, bootId, generation, createdAt: new Date(nowMs).toISOString(), leaseUntil: new Date(nowMs + this.lockLeaseMs).toISOString() };
      try {
        await this.createDurable(lockPath, JSON.stringify(metadata));
        await this.syncParent(lockPath, "lock-create-dir");
        return { path: lockPath, token, pid: process.pid, bootId, generation };
      }
      catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
        let stale: z.infer<typeof lockSchema> | null = null;
        try { stale = lockSchema.parse(JSON.parse(await readFile(lockPath, "utf8"))); } catch { /* corrupt lock fails closed */ }
        if (stale !== null && !this.ownerIsAlive(stale, bootId)) {
          generationFloor = Math.max(generationFloor, stale.generation + 1);
          const tombstone = `${lockPath}.reap.${randomUUID()}`;
          try {
            await rename(lockPath, tombstone);
            await this.syncParent(lockPath, "lock-tombstone-rename-dir");
            const moved = await readFile(tombstone, "utf8");
            if (lockSchema.parse(JSON.parse(moved)).token !== stale.token) throw new Error("Lock token changed during recovery");
            await rm(tombstone, { force: true });
            await this.syncParent(tombstone, "lock-tombstone-remove-dir");
            continue;
          } catch (reapError) { if ((reapError as NodeJS.ErrnoException).code !== "ENOENT") throw reapError; }
        }
        await new Promise((resolve) => setTimeout(resolve, 5));
      }
    }
    throw new Error("Timed out acquiring durable work-item lock");
  }
  private async release(lock: Lock): Promise<void> {
    try {
      const current = lockSchema.parse(JSON.parse(await readFile(lock.path, "utf8")));
      if (current.token === lock.token
        && current.pid === lock.pid
        && current.bootId === lock.bootId
        && current.generation === lock.generation) {
        await rm(lock.path, { force: true });
        await this.syncParent(lock.path, "lock-remove-dir");
      }
    }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
  }
  private async locked<T>(path: string, operation: (lock: Lock) => Promise<T>): Promise<T> { const lock = await this.acquire(path); try { return await operation(lock); } finally { await this.release(lock); } }

  async initialize(itemInput: WorkItem): Promise<void> {
    const item = WorkItemSchema.parse(itemInput); const path = this.path(item.loopId, item.id);
    await this.locked(path, async (lock) => {
      try { const existing = await this.read(path); if (JSON.stringify(existing.item) !== JSON.stringify(item)) throw new Error("Work item already initialized with different content"); }
      catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
        await this.write(path, { item, records: {}, fencingGeneration: lock.generation }, lock);
      }
    });
  }
  async load(loopId: string, workItemId: string): Promise<WorkItem | null> {
    try { return structuredClone((await this.read(this.path(loopId, workItemId))).item); }
    catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return null; throw error; }
  }
  async mutate(input: WorkItemCasMutation): Promise<WorkItemCasMutationResult> {
    const path = this.path(input.loopId, input.workItemId);
    return this.locked(path, async (lock) => {
      const state = await this.read(path);
      const key = `${input.processVersion}:${input.idempotencyKey}`;
      const seen = state.records[key];
      if (seen !== undefined) {
        if (seen.fromState !== input.fromState || seen.expectedRevision !== input.expectedRevision
          || seen.occurrence !== input.transition.resultingRevision || seen.payloadDigest !== input.payloadDigest) return { kind: "collision" };
        return { kind: "deduplicated", item: structuredClone(seen.item) };
      }
      if (state.item.loopId !== input.loopId || state.item.id !== input.workItemId || state.item.processVersion !== input.processVersion
        || state.item.revision !== input.expectedRevision || state.item.currentState !== input.fromState) {
        return { kind: "conflict", actualRevision: state.item.revision };
      }
      const nextItem = WorkItemSchema.parse(input.nextItem);
      if (nextItem.revision !== input.expectedRevision + 1 || nextItem.loopId !== input.loopId || nextItem.id !== input.workItemId
        || input.transition.resultingRevision !== nextItem.revision || input.transition.payloadDigest !== input.payloadDigest) {
        throw new Error("Invalid work-item CAS mutation envelope");
      }
      const record = { fromState: input.fromState, expectedRevision: input.expectedRevision,
        occurrence: input.transition.resultingRevision, payloadDigest: input.payloadDigest, item: nextItem };
      await this.write(path, { item: nextItem, records: { ...state.records, [key]: record }, fencingGeneration: lock.generation }, lock);
      return { kind: "applied" };
    });
  }
}
