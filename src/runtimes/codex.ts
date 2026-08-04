import { constants } from "node:fs";
import { access, readFile } from "node:fs/promises";
import type {
  CommandRunner,
  PromptCycleEntryContract,
  RenderedRuntimePackage,
  RuntimeAdapter,
  RuntimePreflight,
  RuntimePreflightInput,
  RuntimeRenderInput,
  RuntimeValidation,
} from "./types.js";

type CodexRenderedPackage = RenderedRuntimePackage & {
  toolPolicy: { allow: string[] };
  externalTriggerRequirements: string[];
};

const unavailableRunner: CommandRunner = async () => ({ exitCode: 1, stdout: "", stderr: "runner unavailable" });

function promptCycle(loopId: string): PromptCycleEntryContract {
  return {
    entry: { executable: "loopstack", args: ["prompt-cycle", "run", "--loop", loopId] },
    requestContract: "AgentRunRequest",
    resultContract: "AgentRunResult",
    decisions: ["continue", "wait-human", "wait-external", "stop-success", "stop-failure", "escalate"],
    makerChecker: true,
  };
}

export class CodexRuntimeAdapter implements RuntimeAdapter {
  readonly name = "codex" as const;

  constructor(private readonly runner: CommandRunner = unavailableRunner) {}

  async render(input: RuntimeRenderInput): Promise<CodexRenderedPackage> {
    const { loop } = input;
    const skills = input.skills ?? [`${loop.id}-loop`];
    const toolPolicy = { allow: [...(input.allowedTools ?? [])].sort() };
    const triggers = loop.triggers.map((trigger) => ({
      type: trigger.type,
      enabled: false as const,
      ...(trigger.id === undefined ? {} : { id: trigger.id }),
      role: trigger.role,
      ...(trigger.source === undefined ? {} : { source: trigger.source }),
      ...(trigger.event === undefined ? {} : { event: trigger.event }),
      ...(trigger.idempotencyKey === undefined ? {} : { idempotencyKey: trigger.idempotencyKey }),
      ...(trigger.debounceSeconds === undefined ? {} : { debounceSeconds: trigger.debounceSeconds }),
      ...(trigger.replayWindowHours === undefined ? {} : { replayWindowHours: trigger.replayWindowHours }),
      ...(trigger.payloadSchemaRef === undefined ? {} : { payloadSchemaRef: trigger.payloadSchemaRef }),
      ...(["cron", "webhook", "event", "queue"].includes(trigger.type) ? { external: true } : {}),
      ...(trigger.type === "cron" && typeof trigger.configuration?.schedule === "string"
        ? { schedule: trigger.configuration.schedule }
        : {}),
    }));
    const externalTriggerRequirements = triggers
      .filter((trigger) => trigger.external)
      .map((trigger) => `${trigger.type}: external receiver invokes loopstack prompt-cycle with loop id and idempotency key`);
    const cycle = promptCycle(loop.id);
    const workDirectory = input.workDirectory ?? `loops/${loop.id}`;
    const portable = {
      runtime: this.name,
      manifestVersion: 1 as const,
      loopId: loop.id,
      version: loop.version,
      skills,
      triggers,
      approvalRequired: input.approvalRequired ?? true,
      alertPolicy: input.alertPolicy ?? "on-failure",
      target: loop.target,
      feedback: loop.feedback,
      guardrails: loop.guardrails,
      serviceLevels: loop.serviceLevels,
      promptCycle: cycle,
      toolPolicy,
      externalTriggerRequirements,
      workDirectory,
    };
    return {
      ...portable,
      files: {
        "runtime.json": `${JSON.stringify(portable, null, 2)}\n`,
        ".codex-plugin/plugin.json": `${JSON.stringify({
          name: `loopstack-${loop.id}`,
          version: String(loop.version),
          description: `Codex runtime wrapper for ${loop.name}`,
        }, null, 2)}\n`,
        "tool-policy.json": `${JSON.stringify(toolPolicy, null, 2)}\n`,
        "skill-wrapper.md": `Run ${skills.join(", ")} through the Loopstack prompt-cycle controller. Preserve human gates and durable checkpoints.\n`,
      },
    };
  }

  async preflight(input: RuntimePreflightInput): Promise<RuntimePreflight> {
    const [cli, plugins] = await Promise.all([
      this.runner("codex", ["--version"]),
      this.runner("codex", ["plugin", "list"]),
    ]);
    const blockers: string[] = [];
    if (cli.exitCode !== 0) blockers.push("codex_cli");
    if (plugins.exitCode !== 0) blockers.push("skills_directory");
    return {
      runtime: this.name,
      cliPresent: cli.exitCode === 0,
      authenticatedProfile: cli.exitCode === 0,
      skillsDirectory: plugins.exitCode === 0,
      triggerSupport: { manual: true, cron: false, webhook: false, event: false, queue: false },
      approvalSupport: true,
      deliveryTargetStatus: input.deliveryTarget ? "untested" : "ready",
      blockers,
    };
  }

  async validate(packagePath: string): Promise<RuntimeValidation> {
    try {
      await Promise.all([
        access(`${packagePath}/runtime.json`, constants.R_OK),
        access(`${packagePath}/.codex-plugin/plugin.json`, constants.R_OK),
      ]);
      JSON.parse(await readFile(`${packagePath}/runtime.json`, "utf8"));
      JSON.parse(await readFile(`${packagePath}/.codex-plugin/plugin.json`, "utf8"));
      return { valid: true, errors: [] };
    } catch (error) {
      return { valid: false, errors: [error instanceof Error ? error.message : String(error)] };
    }
  }
}
