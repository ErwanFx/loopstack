import { resolve } from "node:path";
import { createRuntimeAdapter } from "../runtimes/registry.js";

function option(args: readonly string[], name: string): string | undefined {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
}

export async function runRuntimeValidateCommand(args: readonly string[]): Promise<number> {
  const runtime = option(args, "--runtime");
  const rawPackagePath = option(args, "--package");
  if (!runtime || !rawPackagePath) {
    console.error(JSON.stringify({
      code: "INVALID_ARGUMENT",
      message: "Provide --runtime and --package",
    }));
    return 2;
  }

  const packagePath = resolve(rawPackagePath);
  try {
    const validation = await createRuntimeAdapter(runtime).validate(packagePath);
    const result = { runtime, packagePath: rawPackagePath, ...validation };
    if (!validation.valid) {
      console.error(JSON.stringify({ code: "RUNTIME_VALIDATION_FAILED", ...result }));
      return 2;
    }
    console.log(JSON.stringify(result));
    return 0;
  } catch (error) {
    console.error(JSON.stringify({
      code: "RUNTIME_VALIDATION_FAILED",
      runtime,
      packagePath: rawPackagePath,
      message: error instanceof Error ? error.message : String(error),
    }));
    return 2;
  }
}
