import { runTransitionCommand } from "./commands/transition.js";
import { runReadinessCommand } from "./commands/readiness.js";
import { runValidateCommand } from "./commands/validate.js";
import { runRuntimePreflightCommand } from "./commands/runtime-preflight.js";
import { runRuntimeRenderCommand } from "./commands/runtime-render.js";
import { runStoragePlanCommand } from "./commands/storage-plan.js";
import { runStorageVerifyCommand } from "./commands/storage-verify.js";
import { runListCommand } from "./commands/list.js";
import { runShowCommand } from "./commands/show.js";
import { runLifecycleCommand } from "./commands/lifecycle.js";
import { runInitBusinessRepoCommand } from "./commands/init-business-repo.js";
import { runQaCommand } from "./commands/qa.js";
import { runMonitorCommand } from "./commands/monitor.js";
import { runGraphCommand } from "./commands/graph.js";

const commands = ["validate", "transition", "readiness", "runtime", "storage", "graph", "qa", "monitor", "list", "show", "lifecycle", "init-business-repo"] as const;

function printHelp(): void {
  console.log(`Loopstack\n\nCommands:\n${commands.map((command) => `  ${command}`).join("\n")}`);
}

const argument = process.argv[2];

if (!argument || argument === "--help" || argument === "-h") {
  printHelp();
  process.exit(0);
}

if (!commands.includes(argument as (typeof commands)[number])) {
  console.error(`Unknown command: ${argument}`);
  printHelp();
  process.exit(1);
}

if (argument === "transition") {
  process.exit(runTransitionCommand(process.argv.slice(3)));
}

if (argument === "readiness") {
  process.exit(runReadinessCommand(process.argv.slice(3)));
}

if (argument === "validate") {
  process.exit(runValidateCommand(process.argv.slice(3)));
}

if (argument === "runtime") {
  const action = process.argv[3];
  const args = process.argv.slice(4);
  if (action === "render") process.exit(await runRuntimeRenderCommand(args));
  if (action === "preflight") process.exit(await runRuntimePreflightCommand(args));
  console.error(JSON.stringify({ code: "INVALID_ARGUMENT", message: "Use runtime render or runtime preflight" }));
  process.exit(2);
}

if (argument === "storage") {
  const action = process.argv[3];
  const args = process.argv.slice(4);
  if (action === "plan") process.exit(runStoragePlanCommand(args));
  if (action === "verify") process.exit(runStorageVerifyCommand(args));
  console.error(JSON.stringify({ code: "INVALID_ARGUMENT", message: "Use storage plan or storage verify" }));
  process.exit(2);
}

if (argument === "graph") process.exit(runGraphCommand(process.argv.slice(3)));

if (argument === "list") process.exit(runListCommand(process.argv.slice(3)));
if (argument === "show") process.exit(runShowCommand(process.argv.slice(3)));
if (argument === "lifecycle") process.exit(runLifecycleCommand(process.argv.slice(3)));
if (argument === "init-business-repo") process.exit(runInitBusinessRepoCommand(process.argv.slice(3)));
if (argument === "qa") process.exit(await runQaCommand(process.argv.slice(3)));
if (argument === "monitor") process.exit(runMonitorCommand(process.argv.slice(3)));

console.error(`Command not implemented yet: ${argument}`);
process.exit(1);
