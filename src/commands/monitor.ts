import { readFileSync } from "node:fs";
import { findStaleRuns, type WatchedRun } from "../operations/watchdog.js";

export function monitorRunsFile(path: string, now: string, thresholdMs: number) {
  return findStaleRuns(JSON.parse(readFileSync(path, "utf8")) as WatchedRun[], now, thresholdMs);
}

export function runMonitorCommand(args: readonly string[]): number {
  const [path, now, threshold] = args;
  if (!path || !now || !threshold) return 2;
  try {
    const stale = monitorRunsFile(path, now, Number(threshold));
    console.log(JSON.stringify({ health: stale.length > 0 ? "stale" : "healthy", stale }, null, 2));
    return stale.length > 0 ? 2 : 0;
  } catch (error) {
    console.error(JSON.stringify({ code: "MONITOR_FAILED", message: error instanceof Error ? error.message : String(error) }));
    return 2;
  }
}
