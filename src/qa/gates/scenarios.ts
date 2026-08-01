import { binaryGate } from "./gate.js";
export const scenariosGate = (value: "pass" | "fail") => binaryGate("scenarios", value === "pass", "SCENARIO_FAILED", "scenario matrix");
