import type { LoopDefinition } from "../domain/types.js";

export const runtimeNames = ["hermes", "claude-code"] as const;
export type RuntimeName = (typeof runtimeNames)[number];

export type CommandResult = { exitCode: number; stdout: string; stderr: string };
export type CommandRunner = (command: string, args: readonly string[]) => Promise<CommandResult>;

export type RuntimePreflightInput = {
  loop: LoopDefinition;
  requiredSkills: string[];
  requiredTools: string[];
  deliveryTarget?: string;
  profile?: string;
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
};

export type RenderedTrigger = {
  type: string;
  enabled: false;
  external?: boolean;
  schedule?: string;
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
