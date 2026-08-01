import type { SemanticDiff } from "./semantic-diff.js";

export function pinRunVersion<T extends { loopVersion?: number }>(run: T, version: number): T & { loopVersion: number } {
  return { ...run, loopVersion: run.loopVersion ?? version };
}

export function validateGeneratedWrapperChange(canonicalDiff: SemanticDiff, generatedWrapperChanged: boolean): void {
  if (generatedWrapperChanged && canonicalDiff.changes.length === 0) {
    throw new Error("Generated runtime wrappers may change only after canonical YAML changes");
  }
}
