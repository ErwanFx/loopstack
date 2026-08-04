import { mkdir, writeFile } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { parse } from "yaml";
import { LoopDefinitionSchema } from "../domain/schemas.js";
import { createRuntimeAdapter } from "../runtimes/registry.js";
import { validateLoopFile } from "./validate.js";
import { PromptGraphDefinitionSchema } from "../graph/schemas.js";

function option(args: readonly string[], name: string): string | undefined {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
}

export async function runRuntimeRenderCommand(args: readonly string[]): Promise<number> {
  const runtime = option(args, "--runtime");
  const loopPath = option(args, "--loop");
  const outputPath = option(args, "--out");
  const graphPath = option(args, "--graph");
  const profile = option(args, "--profile");
  const workDirectory = option(args, "--workdir") ?? dirname(resolve(loopPath ?? "."));
  if (!runtime || !loopPath || !outputPath) {
    console.error(JSON.stringify({ code: "INVALID_ARGUMENT", message: "Provide --runtime, --loop, and --out" }));
    return 2;
  }
  try {
    const validation = validateLoopFile(loopPath);
    if (!validation.valid) {
      console.error(JSON.stringify({ code: "CORE_VALIDATION_FAILED", validation }));
      return 2;
    }
    const document = parse(readFileSync(loopPath, "utf8")) as { loop?: unknown; tools?: string[] };
    const loop = LoopDefinitionSchema.parse(document.loop);
    const graph = graphPath === undefined
      ? undefined
      : PromptGraphDefinitionSchema.parse(parse(readFileSync(graphPath, "utf8")));
    if (graph !== undefined && graph.loopId !== loop.id) {
      throw new Error(`Graph loopId ${graph.loopId} does not match loop ${loop.id}`);
    }
    const adapter = createRuntimeAdapter(runtime);
    const rendered = await adapter.render({
      loop,
      allowedTools: document.tools ?? [],
      workDirectory,
      ...(profile === undefined ? {} : { profile }),
      ...(graph === undefined ? {} : { graph }),
    });
    await mkdir(outputPath, { recursive: true });
    await Promise.all(Object.entries(rendered.files).map(async ([name, content]) => {
      const path = `${outputPath}/${name}`;
      await mkdir(path.slice(0, Math.max(0, path.lastIndexOf("/"))), { recursive: true });
      await writeFile(path, content);
    }));
    const packageValidation = await adapter.validate(resolve(outputPath));
    if (!packageValidation.valid) {
      throw new Error(`Generated runtime package is invalid: ${packageValidation.errors.join("; ")}`);
    }
    console.log(JSON.stringify({ runtime, loopId: loop.id, outputPath, triggersEnabled: false }));
    return 0;
  } catch (error) {
    console.error(JSON.stringify({ code: "RUNTIME_RENDER_FAILED", message: error instanceof Error ? error.message : String(error) }));
    return 2;
  }
}
