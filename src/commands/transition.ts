import { canTransition, lifecycleTransitions } from "../domain/lifecycle.js";
import { LoopStatusSchema } from "../domain/schemas.js";

function option(args: readonly string[], name: string): string | undefined {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
}

export function runTransitionCommand(args: readonly string[]): number {
  const parsedFrom = LoopStatusSchema.safeParse(option(args, "--from"));
  const parsedTo = LoopStatusSchema.safeParse(option(args, "--to"));

  if (!parsedFrom.success || !parsedTo.success) {
    console.error(JSON.stringify({ code: "INVALID_ARGUMENT", message: "Provide valid --from and --to statuses" }));
    return 2;
  }

  const { data: from } = parsedFrom;
  const { data: to } = parsedTo;
  if (!canTransition(from, to)) {
    console.error(JSON.stringify({ code: "INVALID_TRANSITION", from, to, allowed: lifecycleTransitions[from] }));
    return 2;
  }

  console.log(JSON.stringify({ status: to }));
  return 0;
}
