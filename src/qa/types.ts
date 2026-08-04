export type QaVerdict = "pass" | "blocked";
export type QaFinding = { code: string; message: string };
export type QaGateResult = {
  name: string;
  status: "pass" | "fail" | "skip";
  blocking: boolean;
  durationMs: number;
  findings: QaFinding[];
  evidence: string[];
};
export type QaReport = {
  verdict: QaVerdict;
  /** False means the report is structural diagnostics only and cannot authorize launch. */
  authoritative: boolean;
  gates: QaGateResult[];
  blockers: QaFinding[];
  markdown: string;
};
