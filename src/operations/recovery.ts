export type RecoverableAction = {
  id: string;
  idempotent: boolean;
  state: "completed" | "failed" | "unknown";
};

export function buildRecoveryPlan(actions: readonly RecoverableAction[]) {
  return actions.map((action) => ({
    id: action.id,
    strategy: action.state === "unknown"
      ? "reconcile-first" as const
      : action.state === "failed" && action.idempotent
        ? "safe-to-retry" as const
        : "human-only" as const,
  }));
}
