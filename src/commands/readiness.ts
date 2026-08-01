import { readFileSync } from "node:fs";
import { parse } from "yaml";
import { evaluateReadiness, type ReadinessCandidate } from "../domain/readiness.js";

export function runReadinessCommand(args: readonly string[]): number {
  const path = args[0];
  if (!path) {
    console.error(JSON.stringify({ code: "INVALID_ARGUMENT", message: "Provide a YAML file path" }));
    return 2;
  }

  try {
    const document = parse(readFileSync(path, "utf8")) as ReadinessCandidate & { readiness?: ReadinessCandidate };
    const report = evaluateReadiness(document.readiness ?? document);
    console.log(JSON.stringify(report, null, 2));
    return report.status === "ready" ? 0 : 2;
  } catch (error) {
    console.error(JSON.stringify({ code: "INVALID_READINESS_FILE", message: error instanceof Error ? error.message : String(error) }));
    return 2;
  }
}
