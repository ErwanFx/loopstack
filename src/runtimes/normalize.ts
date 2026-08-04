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
      ...(trigger.id === undefined ? {} : { id: trigger.id }),
      ...(trigger.role === undefined ? {} : { role: trigger.role }),
      ...(trigger.source === undefined ? {} : { source: trigger.source }),
      ...(trigger.event === undefined ? {} : { event: trigger.event }),
      ...(trigger.idempotencyKey === undefined ? {} : { idempotencyKey: trigger.idempotencyKey }),
      ...(trigger.debounceSeconds === undefined ? {} : { debounceSeconds: trigger.debounceSeconds }),
      ...(trigger.replayWindowHours === undefined ? {} : { replayWindowHours: trigger.replayWindowHours }),
      ...(trigger.payloadSchemaRef === undefined ? {} : { payloadSchemaRef: trigger.payloadSchemaRef }),
      ...(trigger.schedule ? { schedule: trigger.schedule } : {}),
    })),
    approvalRequired: rendered.approvalRequired,
    alertPolicy: rendered.alertPolicy,
    target: rendered.target,
    feedback: rendered.feedback,
    guardrails: rendered.guardrails,
    serviceLevels: rendered.serviceLevels,
    promptCycle: rendered.promptCycle,
    workDirectory: rendered.workDirectory,
  };
}
