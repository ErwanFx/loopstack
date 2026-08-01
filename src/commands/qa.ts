import { readFileSync } from "node:fs";
import { runQa, type QaInput } from "../qa/runner.js";

export async function evaluateQaFile(path: string) {
  return runQa(JSON.parse(readFileSync(path, "utf8")) as QaInput);
}

export async function runQaCommand(args: readonly string[]): Promise<number> {
  const path = args[0];
  if (!path) return 2;
  try {
    const report = await evaluateQaFile(path);
    console.log(JSON.stringify(report, null, 2));
    return report.verdict === "pass" ? 0 : 2;
  } catch (error) {
    console.error(JSON.stringify({ code: "QA_FAILED", message: error instanceof Error ? error.message : String(error) }));
    return 2;
  }
}
