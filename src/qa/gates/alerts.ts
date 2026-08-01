import { binaryGate } from "./gate.js";
export const alertsGate = (value: "pass" | "fail") => binaryGate("alerts", value === "pass", "ALERT_DELIVERY_UNVERIFIED", "alert delivery test");
