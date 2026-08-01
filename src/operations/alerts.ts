export type LoopAlert = {
  code: string;
  loopId: string;
  runId: string;
  failedStep: string;
  completedActions: string[];
  duplicateRisk: "none" | "possible" | "unknown";
  retryHistory: string[];
  recommendedAction: string;
  resumeCommand: string;
};

export function formatAlert(alert: LoopAlert) {
  return {
    ...alert,
    message: [
      `[${alert.code}] loop=${alert.loopId} run=${alert.runId}`,
      `failed_step=${alert.failedStep}`,
      `completed_actions=${alert.completedActions.join(",")}`,
      `duplicate_risk=${alert.duplicateRisk}`,
      `retry_history=${alert.retryHistory.join(" | ")}`,
      `recommended_action=${alert.recommendedAction}`,
      `resume=${alert.resumeCommand}`,
    ].join("\n"),
  };
}

export async function dispatchAlert(
  alert: LoopAlert,
  deliver: (message: string) => Promise<void>,
  fallback: (line: string) => void,
) {
  const formatted = formatAlert(alert);
  try {
    await deliver(formatted.message);
    return { delivered: true as const, incident: null };
  } catch (error) {
    fallback(formatted.message);
    return {
      delivered: false as const,
      incident: {
        code: "ALERT_DELIVERY_FAILED",
        loopId: alert.loopId,
        runId: alert.runId,
        message: error instanceof Error ? error.message : String(error),
      },
    };
  }
}
