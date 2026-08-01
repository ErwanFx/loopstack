import { describe, expect, it } from "vitest";
import { findStaleRuns } from "../../src/operations/watchdog.js";

describe("heartbeat watchdog", () => {
  it("alerts on stale non-terminal runs even without a recorded failure", () => {
    const stale = findStaleRuns([
      { loopId: "seo-growth", runId: "run-1", status: "running", heartbeatAt: "2026-08-01T10:00:00.000Z" },
      { loopId: "seo-growth", runId: "run-2", status: "completed", heartbeatAt: "2026-08-01T09:00:00.000Z" },
      { loopId: "seo-growth", runId: "run-3", status: "running", heartbeatAt: "2026-08-01T11:59:30.000Z" },
    ], "2026-08-01T12:00:00.000Z", 60_000);
    expect(stale).toHaveLength(1);
    expect(stale[0]).toMatchObject({ runId: "run-1", alertCode: "STALE_HEARTBEAT" });
  });
});
