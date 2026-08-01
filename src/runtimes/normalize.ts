import type { RenderedRuntimePackage } from "./types.js";

export function normalizeRuntimePackage(rendered: RenderedRuntimePackage): object {
  return {
    manifestVersion: rendered.manifestVersion,
    loopId: rendered.loopId,
    version: rendered.version,
    skills: rendered.skills,
    triggers: rendered.triggers.map((trigger) => ({
      type: trigger.type === "schedule" ? "cron" : trigger.type,
      enabled: trigger.enabled,
      ...(trigger.schedule ? { schedule: trigger.schedule } : {}),
    })),
    approvalRequired: rendered.approvalRequired,
    alertPolicy: rendered.alertPolicy,
    target: rendered.target,
    feedback: rendered.feedback,
  };
}
