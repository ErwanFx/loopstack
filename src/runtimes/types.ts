import type { LoopDefinition } from "../domain/types.js";
import type { PromptGraphDefinition } from "../graph/types.js";
import type { GraphExecutionEntryContract } from "../graph/runtime-types.js";

export const runtimeNames = ["hermes", "claude-code", "codex"] as const;
export type RuntimeName = (typeof runtimeNames)[number];

export type CommandResult = { exitCode: number; stdout: string; stderr: string };
export type CommandRunner = (command: string, args: readonly string[]) => Promise<CommandResult>;

export type RuntimePreflightInput = {
  loop: LoopDefinition;
  requiredSkills: string[];
  requiredTools: string[];
  deliveryTarget?: string;
  profile?: string;
  graph?: PromptGraphDefinition;
};

export type RuntimePreflight = {
  runtime: RuntimeName;
  cliPresent: boolean;
  authenticatedProfile: boolean;
  skillsDirectory: boolean;
  triggerSupport: Record<string, boolean>;
  approvalSupport: boolean;
  deliveryTargetStatus: "ready" | "missing" | "untested";
  blockers: string[];
};

export type RuntimeRenderInput = {
  loop: LoopDefinition;
  skills?: string[];
  allowedTools?: string[];
  approvalRequired?: boolean;
  alertPolicy?: string;
  workDirectory?: string;
  deliveryTarget?: string;
  graph?: PromptGraphDefinition;
};

export type RuntimeGraphCapabilities = {
  freshSessions: true;
  sequentialFallback: true;
  maxConcurrency: number;
  dynamicWorkflow?: "optional";
};

export type RuntimeGraphExecution = GraphExecutionEntryContract & {
  agentBindings: Array<{
    id: string;
    profile?: string;
    sessionPolicy: "fresh" | "resume";
    maxConcurrency: number;
    requiredSkills: string[];
    requiredTools: string[];
  }>;
  capabilities: RuntimeGraphCapabilities;
};

export type RenderedTrigger = {
  type: string;
  enabled: false;
  external?: boolean;
  schedule?: string;
  id?: string;
  role?: "primary" | "recovery" | "watchdog" | "resume";
  source?: string;
  event?: string;
  idempotencyKey?: string;
  debounceSeconds?: number;
  replayWindowHours?: number;
  payloadSchemaRef?: string;
};

export type PromptCycleEntryContract = {
  entry: { executable: string; args: string[] };
  requestContract: "AgentRunRequest";
  resultContract: "AgentRunResult";
  decisions: ["continue", "wait-human", "wait-external", "stop-success", "stop-failure", "escalate"];
  makerChecker: true;
};

export type RenderedRuntimePackage = {
  runtime: RuntimeName;
  manifestVersion: 1;
  loopId: string;
  version: number;
  skills: string[];
  triggers: RenderedTrigger[];
  approvalRequired: boolean;
  alertPolicy: string;
  target: LoopDefinition["target"];
  feedback: LoopDefinition["feedback"];
  guardrails: LoopDefinition["guardrails"];
  serviceLevels: LoopDefinition["serviceLevels"];
  promptCycle: PromptCycleEntryContract;
  graphExecution?: RuntimeGraphExecution;
  workDirectory: string;
  files: Record<string, string>;
  [key: string]: unknown;
};

export type RuntimeValidation = { valid: boolean; errors: string[] };

export interface RuntimeAdapter {
  readonly name: RuntimeName;
  preflight(input: RuntimePreflightInput): Promise<RuntimePreflight>;
  render(input: RuntimeRenderInput): Promise<RenderedRuntimePackage>;
  validate(packagePath: string): Promise<RuntimeValidation>;
}
