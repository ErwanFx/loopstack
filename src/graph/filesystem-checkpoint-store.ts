import { randomUUID } from "node:crypto";
import { mkdir, open, readFile, rename, rm } from "node:fs/promises";
import { dirname, join } from "node:path";
import { z } from "zod";
import type { GraphCheckpoint, GraphCheckpointStore } from "./runtime-types.js";

const hash = z.string().regex(/^[a-f0-9]{64}$/);
const iso = z.iso.datetime();
const checkpointSchema = z.object({
  revision: z.number().int().nonnegative(), graphId: z.string().min(1), graphVersion: z.number().int().positive(),
  topologyHash: hash, loopId: z.string().min(1), runId: z.string().min(1), workItemId: z.string().min(1),
  runContractHash: hash, inputSnapshotHash: hash,
  phase: z.enum(["before-node", "after-node", "terminal"]),
  status: z.enum(["running", "waiting-human", "waiting-external", "completed", "failed", "escalated"]),
  currentNodeId: z.string().min(1).optional(), readyNodeIds: z.array(z.string().min(1)),
  step: z.number().int().nonnegative(), accumulatedCost: z.number().finite().nonnegative(),
  artifacts: z.record(z.string(), z.unknown()), state: z.record(z.string(), z.unknown()),
  nodeAttempts: z.record(z.string(), z.number().int().nonnegative()),
  edgeTraversals: z.record(z.string(), z.number().int().nonnegative()),
  triggeredIncomingEdges: z.record(z.string(), z.array(z.string())),
  startedAt: iso, updatedAt: iso, reason: z.string().optional(),
  reasonCode: z.enum(["MAX_STEPS", "MAX_COST", "DEADLINE", "FAN_IN_INCOMPLETE", "MAX_TRAVERSALS", "NODE_FAILED", "ARTIFACT_CONTRACT_VIOLATION", "SIDE_EFFECT_UNKNOWN", "TOPOLOGY_CHANGED", "CHECKPOINT_MISMATCH", "RUN_CLAIMED", "NODE_TIMEOUT"]).optional(),
}).strict().superRefine((value, context) => {
  if (value.phase === "before-node" && value.currentNodeId === undefined) context.addIssue({ code: "custom", message: "before-node checkpoint requires currentNodeId" });
  if (value.status === "running" && value.phase === "terminal") context.addIssue({ code: "custom", message: "terminal checkpoint cannot be running" });
  if (value.status !== "running" && value.phase !== "terminal" && !["waiting-human", "waiting-external"].includes(value.status)) {
    context.addIssue({ code: "custom", message: "terminal status requires terminal phase" });
  }
});
const claimSchema = z.object({
  nodeId: z.string().min(1), expectedRevision: z.number().int().nonnegative(), ownerId: z.string().min(1),
  leaseUntil: iso, token: z.string().min(1),
}).strict();
const stateSchema = z.object({
  checkpoint: checkpointSchema.nullable(), claim: claimSchema.nullable(),
  fencingGeneration: z.number().int().nonnegative(),
}).strict();
type DurableRunState = z.infer<typeof stateSchema>;
interface LockMetadata { token: string; ownerId: string; pid: number; bootId: string; generation: number; createdAt: string; leaseUntil: string }
const lockSchema = z.object({
  token: z.string().uuid(), ownerId: z.string().min(1), pid: z.number().int().positive(),
  bootId: z.string().uuid(), generation: z.number().int().positive(),
  createdAt: iso, leaseUntil: iso,
}).strict();

export class FilesystemGraphCheckpointStore implements GraphCheckpointStore {
  private bootId: string | null = null;
  constructor(
    private readonly root: string,
    private readonly now: () => Date = () => new Date(),
    private readonly lockLeaseMs = 5_000,
    private readonly durabilityObserver: (event: string) => void = () => undefined,
  ) {}

  private path(runId: string): string {
    if (!/^[A-Za-z0-9._-]+$/.test(runId)) throw new Error("Unsafe runId");
    return join(this.root, `${runId}.json`);
  }
  private runIdFromToken(token: string): string | null {
    const encoded = token.split(".", 1)[0];
    if (encoded === undefined) return null;
    try { const runId = Buffer.from(encoded, "base64url").toString("utf8"); this.path(runId); return runId; } catch { return null; }
  }
  private validateState(raw: unknown, runId: string): DurableRunState {
    const state = stateSchema.parse(raw);
    if (state.checkpoint !== null && state.checkpoint.runId !== runId) throw new Error("Checkpoint runId binding mismatch");
    if (state.claim !== null) {
      if (state.checkpoint === null || state.claim.expectedRevision !== state.checkpoint.revision) throw new Error("Claim/checkpoint revision invariant failed");
      if (this.runIdFromToken(state.claim.token) !== runId) throw new Error("Claim token/run binding mismatch");
    }
    return state;
  }
  private async read(runId: string): Promise<DurableRunState> {
    try { return this.validateState(JSON.parse(await readFile(this.path(runId), "utf8")), runId); }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return { checkpoint: null, claim: null, fencingGeneration: 0 };
      throw error;
    }
  }
  protected async beforeCommit(): Promise<void> {}
  private async currentBootId(): Promise<string> {
    if (this.bootId === null) this.bootId = (await readFile("/proc/sys/kernel/random/boot_id", "utf8")).trim();
    return z.string().uuid().parse(this.bootId);
  }
  private ownerIsAlive(lock: LockMetadata, bootId: string): boolean {
    if (lock.bootId !== bootId) return false;
    try { process.kill(lock.pid, 0); return true; }
    catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code === "ESRCH") return false;
      return true;
    }
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
  private async write(runId: string, state: DurableRunState, lock: { path: string; metadata: LockMetadata }): Promise<void> {
    const target = this.path(runId);
    const validated = this.validateState(state, runId);
    if (validated.fencingGeneration !== lock.metadata.generation) throw new Error("Fencing generation mismatch");
    await mkdir(dirname(target), { recursive: true });
    const temporary = `${target}.${process.pid}.${randomUUID()}.tmp`;
    try {
      await this.createDurable(temporary, JSON.stringify(validated));
      this.durabilityObserver("state-temp-file");
      await this.beforeCommit();
      const currentLock = lockSchema.parse(JSON.parse(await readFile(lock.path, "utf8")));
      if (currentLock.token !== lock.metadata.token || currentLock.generation !== lock.metadata.generation
        || currentLock.pid !== lock.metadata.pid || currentLock.bootId !== lock.metadata.bootId) throw new Error("Stale filesystem lock owner");
      const currentState = await this.read(runId);
      if (currentState.fencingGeneration > lock.metadata.generation) throw new Error("Stale fencing generation");
      await rename(temporary, target);
      await this.syncParent(target, "state-rename-dir");
    } catch (error) {
      await rm(temporary, { force: true });
      throw error;
    }
  }
  private async acquireLock(runId: string): Promise<{ path: string; metadata: LockMetadata }> {
    const path = `${this.path(runId)}.lock`;
    await mkdir(dirname(path), { recursive: true });
    const bootId = await this.currentBootId();
    let generationFloor = 1;
    for (let attempt = 0; attempt < 400; attempt += 1) {
      const nowMs = this.now().getTime();
      if (!Number.isFinite(nowMs)) throw new Error("Invalid host clock");
      const generation = Math.max(generationFloor, (await this.read(runId)).fencingGeneration + 1);
      const metadata = { token: randomUUID(), ownerId: `${process.pid}`, pid: process.pid, bootId, generation, createdAt: new Date(nowMs).toISOString(), leaseUntil: new Date(nowMs + this.lockLeaseMs).toISOString() };
      try {
        await this.createDurable(path, JSON.stringify(metadata));
        await this.syncParent(path, "lock-create-dir");
        return { path, metadata };
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
        let stale: LockMetadata | null = null;
        try { stale = lockSchema.parse(JSON.parse(await readFile(path, "utf8"))); } catch { /* corrupt lock fails closed */ }
        if (stale !== null && !this.ownerIsAlive(stale, bootId)) {
          generationFloor = Math.max(generationFloor, stale.generation + 1);
          const tombstone = `${path}.reap.${randomUUID()}`;
          try {
            await rename(path, tombstone);
            await this.syncParent(path, "lock-tombstone-rename-dir");
            const moved = await readFile(tombstone, "utf8");
            if (lockSchema.parse(JSON.parse(moved)).token !== stale.token) throw new Error("Lock owner changed during stale recovery");
            await rm(tombstone, { force: true });
            await this.syncParent(tombstone, "lock-tombstone-remove-dir");
            continue;
          } catch (reapError) {
            if ((reapError as NodeJS.ErrnoException).code !== "ENOENT") throw reapError;
          }
        }
        await new Promise((resolve) => setTimeout(resolve, 5));
      }
    }
    throw new Error("Timed out acquiring durable graph lock");
  }
  private async releaseLock(lock: { path: string; metadata: LockMetadata }): Promise<void> {
    try {
      const current = lockSchema.parse(JSON.parse(await readFile(lock.path, "utf8")));
      if (current.token === lock.metadata.token) {
        await rm(lock.path, { force: true });
        await this.syncParent(lock.path, "lock-remove-dir");
      }
    } catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
  }
  private async locked<T>(runId: string, operation: (lock: { path: string; metadata: LockMetadata }) => Promise<T>): Promise<T> {
    const lock = await this.acquireLock(runId);
    try { return await operation(lock); } finally { await this.releaseLock(lock); }
  }

  async load(runId: string): Promise<GraphCheckpoint | null> {
    const state = await this.read(runId);
    if (state.checkpoint === null) return null;
    if (state.claim !== null && state.claim.nodeId !== "__terminal__"
      && state.checkpoint.status === "running" && state.checkpoint.phase === "after-node") {
      return structuredClone({ ...state.checkpoint, phase: "before-node", currentNodeId: state.claim.nodeId });
    }
    return structuredClone(state.checkpoint);
  }
  async save(checkpointInput: GraphCheckpoint): Promise<void> {
    const checkpoint = checkpointSchema.parse(checkpointInput) as GraphCheckpoint;
    await this.locked(checkpoint.runId, async (lock) => {
      const state = await this.read(checkpoint.runId);
      if (state.checkpoint !== null) throw new Error("Initial checkpoint already exists");
      await this.write(checkpoint.runId, { checkpoint: structuredClone(checkpoint), claim: null, fencingGeneration: lock.metadata.generation }, lock);
    });
  }
  async claimNode(runId: string, nodeId: string, expectedRevision: number, ownerId: string, leaseUntil: string): Promise<string | null> {
    return this.locked(runId, async (lock) => {
      const state = await this.read(runId);
      if ((state.checkpoint?.revision ?? 0) !== expectedRevision) return null;
      const nowMs = this.now().getTime(); const leaseMs = Date.parse(leaseUntil);
      if (!Number.isFinite(leaseMs) || leaseMs <= nowMs) return null;
      if (state.claim !== null && Date.parse(state.claim.leaseUntil) > nowMs) return null;
      const token = `${Buffer.from(runId).toString("base64url")}.${randomUUID()}`;
      await this.write(runId, { ...state, fencingGeneration: lock.metadata.generation, claim: { nodeId, expectedRevision, ownerId, leaseUntil, token } }, lock);
      return token;
    });
  }
  async renewClaim(claimToken: string, expectedRevision: number, leaseUntil: string): Promise<boolean> {
    const runId = this.runIdFromToken(claimToken); if (runId === null) return false;
    return this.locked(runId, async (lock) => {
      const state = await this.read(runId); const leaseMs = Date.parse(leaseUntil); const nowMs = this.now().getTime();
      if (state.claim?.token !== claimToken || state.claim.expectedRevision !== expectedRevision
        || state.checkpoint?.revision !== expectedRevision || !Number.isFinite(leaseMs) || leaseMs <= nowMs) return false;
      await this.write(runId, { ...state, fencingGeneration: lock.metadata.generation, claim: { ...state.claim, leaseUntil } }, lock);
      return true;
    });
  }
  async saveAfterNode(checkpointInput: GraphCheckpoint, expectedRevision: number, claimToken: string): Promise<GraphCheckpoint> {
    const checkpoint = checkpointSchema.parse(checkpointInput) as GraphCheckpoint;
    return this.locked(checkpoint.runId, async (lock) => {
      const state = await this.read(checkpoint.runId);
      if (state.checkpoint?.revision !== expectedRevision || state.claim?.token !== claimToken
        || state.claim.nodeId !== checkpoint.currentNodeId || state.claim.expectedRevision !== expectedRevision
        || Date.parse(state.claim.leaseUntil) <= this.now().getTime()) throw new Error("Stale checkpoint revision or invalid node claim");
      const committed = checkpointSchema.parse({ ...structuredClone(checkpoint), revision: expectedRevision + 1 }) as GraphCheckpoint;
      await this.write(checkpoint.runId, { checkpoint: committed, claim: null, fencingGeneration: lock.metadata.generation }, lock);
      return structuredClone(committed);
    });
  }
  async releaseNode(runId: string, nodeId: string, claimToken: string): Promise<void> {
    await this.locked(runId, async (lock) => {
      const state = await this.read(runId); if (state.claim === null) return;
      if (state.claim.nodeId !== nodeId || state.claim.token !== claimToken) throw new Error("Invalid node claim token");
      await this.write(runId, { ...state, claim: null, fencingGeneration: lock.metadata.generation }, lock);
    });
  }
}
