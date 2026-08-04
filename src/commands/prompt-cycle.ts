import { existsSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { runPromptCycle } from "../orchestration/prompt-cycle.js";
import type {
  PromptCycleDependencies,
  PromptCycleInput,
} from "../orchestration/prompt-cycle-types.js";

type PromptCycleRunContract = {
  input: PromptCycleInput;
  dependencies: PromptCycleDependencies;
};

type PromptCycleModule = {
  createPromptCycleRun?: (context: {
    loopReference: string;
    modulePath: string;
    cwd: string;
  }) => Promise<PromptCycleRunContract> | PromptCycleRunContract;
};

function option(args: readonly string[], name: string): string | undefined {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
}

export function resolvePromptCycleModule(loopReference: string, cwd = process.cwd()): string {
  const direct = resolve(cwd, loopReference);
  if (existsSync(direct)) {
    return statSync(direct).isDirectory() ? resolve(direct, "prompt-cycle.mjs") : direct;
  }
  return resolve(cwd, "loops", loopReference, "prompt-cycle.mjs");
}

function assertRunContract(value: unknown): asserts value is PromptCycleRunContract {
  if (!value || typeof value !== "object") throw new Error("createPromptCycleRun must return an object");
  const contract = value as Partial<PromptCycleRunContract>;
  if (!contract.input || typeof contract.input !== "object") {
    throw new Error("createPromptCycleRun must return input");
  }
  if (!contract.dependencies || typeof contract.dependencies !== "object") {
    throw new Error("createPromptCycleRun must return dependencies");
  }
}

export async function runPromptCycleCommand(args: readonly string[]): Promise<number> {
  const action = args[0];
  const loopReference = option(args, "--loop");
  if (action !== "run" || !loopReference) {
    console.error(JSON.stringify({
      code: "INVALID_ARGUMENT",
      message: "Use prompt-cycle run --loop <loop-id|directory|module.mjs>",
    }));
    return 2;
  }

  try {
    const modulePath = resolvePromptCycleModule(loopReference);
    if (!existsSync(modulePath)) throw new Error(`Prompt-cycle module not found: ${modulePath}`);
    const loaded = await import(pathToFileURL(modulePath).href) as PromptCycleModule;
    if (typeof loaded.createPromptCycleRun !== "function") {
      throw new Error("Prompt-cycle module must export createPromptCycleRun(context)");
    }
    const contract = await loaded.createPromptCycleRun({
      loopReference,
      modulePath,
      cwd: process.cwd(),
    });
    assertRunContract(contract);
    const outcome = await runPromptCycle(contract.input, contract.dependencies);
    console.log(JSON.stringify(outcome));
    if (outcome.decision === "stop-failure") return 1;
    if (outcome.decision === "escalate") return 3;
    return 0;
  } catch (error) {
    console.error(JSON.stringify({
      code: "PROMPT_CYCLE_FAILED",
      message: error instanceof Error ? error.message : String(error),
    }));
    return 2;
  }
}
