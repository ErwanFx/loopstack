import { binaryGate } from "./gate.js";
export const storageContractGate = (value: "verified" | "invalid") => binaryGate("storage-contract", value === "verified", "STORAGE_CONTRACT_INVALID", "storage schema evidence");
