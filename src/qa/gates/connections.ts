import { binaryGate } from "./gate.js";
export const connectionsGate = (value: "verified" | "missing") => binaryGate("connections", value === "verified", "CONNECTION_UNVERIFIED", "native connection evidence");
