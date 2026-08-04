import { evaluateReadiness, type ReadinessCandidate, type ReadinessReport } from "../domain/readiness.js";
import { loadLoopDocument, loadStructuredDocument } from "./document-loader.js";

export type ProcessClassification =
  | "AI Loop" | "AI-assisted workflow" | "deterministic automation" | "on-demand agent task"
  | "monitoring or reporting system" | "human SOP or approval process" | "data pipeline"
  | "one-time project" | "multiple independent loops requiring decomposition";

export type ValidationEnvelope = {
  /** Backward-compatible alias for schemaValid. It does not mean ready to build or launch. */
  valid: boolean;
  schemaValid: boolean;
  buildReady: boolean;
  readinessReady: boolean;
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

function envelope(classification: ProcessClassification, readiness: ReadinessReport): ValidationEnvelope {
  return {
    valid: true,
    schemaValid: true,
    buildReady: classification !== "AI Loop" || readiness.build_ready,
    readinessReady: readiness.status === "ready",
    classification,
    readiness,
    errors: [],
  };
}

export function validateLoopFile(path: string): ValidationEnvelope {
  const raw = loadStructuredDocument(path) as LoopDocument & { schemaVersion?: unknown };
  const declaresEnvelope = raw !== null && typeof raw === "object"
    && Object.prototype.hasOwnProperty.call(raw, "loop");
  const hintedClassification = classifyProcess(raw);
  if (!declaresEnvelope && hintedClassification !== "AI Loop" && raw.schemaVersion !== 3) {
    return envelope(hintedClassification, evaluateReadiness(raw.readiness ?? {}));
  }

  // Any document declaring `loop` is an envelope and must parse strictly; never downgrade it by hints.
  const loaded = loadLoopDocument(path);
  const document: LoopDocument = {
    loop: loaded.loop,
    ...(loaded.classificationHints === undefined ? {} : { classificationHints: loaded.classificationHints as LoopDocument["classificationHints"] }),
    ...(loaded.readiness === undefined ? {} : { readiness: loaded.readiness }),
  };
  const classification = loaded.shape === "official-v3" ? "AI Loop" : classifyProcess(document);
  return envelope(classification, evaluateReadiness(document.readiness ?? {}));
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
    return result.schemaValid ? 0 : 2;
  } catch (error) {
    console.error(JSON.stringify({ code: "INVALID_LOOP_FILE", message: error instanceof Error ? error.message : String(error) }));
    return 2;
  }
}
