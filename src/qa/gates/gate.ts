import type { QaGateResult } from "../types.js";

export function binaryGate(name: string, passes: boolean, code: string, evidence: string): QaGateResult {
  return {
    name,
    status: passes ? "pass" : "fail",
    blocking: !passes,
    durationMs: 0,
    findings: passes ? [] : [{ code, message: `${name} gate failed` }],
    evidence: [evidence],
  };
}
