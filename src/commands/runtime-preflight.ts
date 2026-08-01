import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { parse } from "yaml";
import { LoopDefinitionSchema } from "../domain/schemas.js";
import { createRuntimeAdapter } from "../runtimes/registry.js";
import type { CommandRunner } from "../runtimes/types.js";

const commandRunner: CommandRunner = (command, args) => new Promise((resolve) => {
  const child = spawn(command, [...args], { stdio: ["ignore", "pipe", "pipe"] });
  let stdout = "";
  let stderr = "";
  child.stdout.on("data", (chunk) => { stdout += String(chunk); });
  child.stderr.on("data", (chunk) => { stderr += String(chunk); });
  child.on("error", (error) => resolve({ exitCode: 1, stdout, stderr: error.message }));
  child.on("close", (code) => resolve({ exitCode: code ?? 1, stdout, stderr }));
});

function option(args: readonly string[], name: string): string | undefined {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
}

export async function runRuntimePreflightCommand(args: readonly string[]): Promise<number> {
  const runtime = option(args, "--runtime");
  const loopPath = option(args, "--loop");
  if (!runtime || !loopPath) {
    console.error(JSON.stringify({ code: "INVALID_ARGUMENT", message: "Provide --runtime and --loop" }));
    return 2;
  }
  try {
    const document = parse(readFileSync(loopPath, "utf8")) as { loop?: unknown; tools?: string[] };
    const loop = LoopDefinitionSchema.parse(document.loop);
    const result = await createRuntimeAdapter(runtime, commandRunner).preflight({
      loop,
      requiredSkills: [`${loop.id}-loop`],
      requiredTools: document.tools ?? [],
    });
    console.log(JSON.stringify(result, null, 2));
    return result.blockers.length === 0 ? 0 : 2;
  } catch (error) {
    console.error(JSON.stringify({ code: "RUNTIME_PREFLIGHT_FAILED", message: error instanceof Error ? error.message : String(error) }));
    return 2;
  }
}
