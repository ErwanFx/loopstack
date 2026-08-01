import { binaryGate } from "./gate.js";
export const staticGate = (value: "valid" | "invalid") => binaryGate("static", value === "valid", "INVALID_MANIFEST", "manifest validation");
