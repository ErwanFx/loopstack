export type SemanticChange = { path: string; before: unknown; after: unknown };
export type SemanticDiff = { changes: SemanticChange[] };

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object";
}

function walk(before: unknown, after: unknown, path: string, changes: SemanticChange[]): void {
  if (Object.is(before, after)) return;
  if (isObject(before) && isObject(after)) {
    const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
    for (const key of [...keys].sort()) walk(before[key], after[key], path ? `${path}.${key}` : key, changes);
    return;
  }
  changes.push({ path, before, after });
}

export function diffLoopVersions(before: unknown, after: unknown): SemanticDiff {
  const changes: SemanticChange[] = [];
  walk(before, after, "", changes);
  return { changes };
}

export function classifyChange(diff: SemanticDiff) {
  const paths = diff.changes.map((change) => change.path);
  const highRisk = paths.some((path) => path.startsWith("approvals") || path.startsWith("permissions"));
  const migrationRequired = paths.some((path) => path.startsWith("storage"));
  const structural = highRisk || migrationRequired || paths.some((path) => path.startsWith("alerts") || path.startsWith("process"));
  return {
    risk: highRisk || migrationRequired ? "high-risk-structural" as const : structural ? "structural" as const : "behavioral" as const,
    approvalRequired: diff.changes.length > 0,
    migrationRequired,
    requiredTests: [...new Set(paths.map((path) => path.split(".")[0]))].sort(),
  };
}
