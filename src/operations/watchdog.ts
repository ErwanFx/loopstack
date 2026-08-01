export type WatchedRun = {
  loopId: string;
  runId: string;
  status: "running" | "waiting-approval" | "completed" | "failed";
  heartbeatAt: string;
};

export function findStaleRuns(runs: readonly WatchedRun[], now: string, thresholdMs: number) {
  const nowMs = Date.parse(now);
  return runs
    .filter((run) => ["running", "waiting-approval"].includes(run.status))
    .filter((run) => nowMs - Date.parse(run.heartbeatAt) > thresholdMs)
    .map((run) => ({ ...run, alertCode: "STALE_HEARTBEAT" as const }));
}
