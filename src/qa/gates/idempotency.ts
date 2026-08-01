import { binaryGate } from "./gate.js";
export const idempotencyGate = (value: "pass" | "fail") => binaryGate("idempotency", value === "pass", "DUPLICATE_SIDE_EFFECT_RISK", "duplicate event simulation");
