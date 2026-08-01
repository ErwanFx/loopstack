import { buildLifecyclePlan } from "../operations/registry.js";

export function runLifecycleCommand(args: readonly string[]): number {
  const [action, loopId, environment] = args;
  if (!(["pause", "resume", "archive"] as string[]).includes(action) || !loopId || !environment) return 2;
  console.log(JSON.stringify(buildLifecyclePlan(loopId, action as "pause" | "resume" | "archive", environment), null, 2));
  return 0;
}
