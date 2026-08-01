import { readFileSync } from "node:fs";
import { parse } from "yaml";
import { evaluateReadiness, type ReadinessCandidate, type ReadinessReport } from "../domain/readiness.js";
import { LoopDefinitionSchema } from "../domain/schemas.js";

export type ProcessClassification =
  | "AI Loop"
  | "AI-assisted workflow"
  | "deterministic automation"
  | "on-demand agent task"
  | "monitoring or reporting system"
  | "human SOP or approval process"
  | "data pipeline"
  | "one-time project"
  | "multiple independent loops requiring decomposition";

export type ValidationEnvelope = {
  valid: boolean;
  classification: ProcessClassification;
  readiness: ReadinessReport;
  errors: Array<{ code: string; path: string; message: string }>;
};

type LoopDocument = {
  classificationHints?: {
    recurring?: boolean;
    decisionMode?: "judgment" | "assisted" | "deterministic" | "human";
    feedbackLoop?: boolean;
    onDemand?: boolean;
    monitorOnly?: boolean;
    dataOnly?: boolean;
    oneTime?: boolean;
    multipleObjectives?: boolean;
  };
  loop?: unknown;
  readiness?: ReadinessCandidate;
};

export function classifyProcess(document: LoopDocument): ProcessClassification {
  const hints = document.classificationHints ?? {};
  if (hints.multipleObjectives) return "multiple independent loops requiring decomposition";
  if (hints.oneTime) return "one-time project";
  if (hints.dataOnly) return "data pipeline";
  if (hints.monitorOnly) return "monitoring or reporting system";
  if (hints.decisionMode === "human") return "human SOP or approval process";
  if (hints.decisionMode === "deterministic") return "deterministic automation";
  if (hints.onDemand && hints.decisionMode === "judgment") return "on-demand agent task";
  if (hints.decisionMode === "assisted") return "AI-assisted workflow";
  if (hints.recurring && hints.decisionMode === "judgment" && hints.feedbackLoop) return "AI Loop";
  return "AI-assisted workflow";
}

export function validateLoopFile(path: string): ValidationEnvelope {
  const document = parse(readFileSync(path, "utf8")) as LoopDocument;
  const classification = classifyProcess(document);
  const readiness = evaluateReadiness(document.readiness ?? {});
  const errors: ValidationEnvelope["errors"] = [];

  if (classification === "AI Loop") {
    const schemaResult = LoopDefinitionSchema.safeParse(document.loop);
    if (!schemaResult.success) {
      errors.push(...schemaResult.error.issues.map((issue) => ({
        code: "SCHEMA_INVALID",
        path: issue.path.join("."),
        message: issue.message,
      })));
    }
    errors.push(...readiness.blocking.map((code) => ({
      code: "READINESS_BLOCKED",
      path: `readiness.${code}`,
      message: `Missing hard requirement: ${code}`,
    })));
  }

  return {
    valid: classification !== "AI Loop" || errors.length === 0,
    classification,
    readiness,
    errors,
  };
}

export function runValidateCommand(args: readonly string[]): number {
  const path = args[0];
  if (!path) {
    console.error(JSON.stringify({ code: "INVALID_ARGUMENT", message: "Provide a YAML file path" }));
    return 2;
  }

  try {
    const result = validateLoopFile(path);
    console.log(JSON.stringify(result, null, 2));
    return result.valid ? 0 : 2;
  } catch (error) {
    console.error(JSON.stringify({ code: "INVALID_LOOP_FILE", message: error instanceof Error ? error.message : String(error) }));
    return 2;
  }
}
