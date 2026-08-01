import { binaryGate } from "./gate.js";
export const approvalsGate = (value: "pass" | "fail") => binaryGate("approvals", value === "pass", "APPROVAL_GATE_INVALID", "approval simulation");
