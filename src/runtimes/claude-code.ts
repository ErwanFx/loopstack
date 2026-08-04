import { access, readFile } from "node:fs/promises";
import { constants } from "node:fs";
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
import { renderGraphExecution } from "./graph-execution.js";

type ClaudeRenderedPackage = RenderedRuntimePackage & {
  permissions: { allow: string[] };
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

export class ClaudeCodeRuntimeAdapter implements RuntimeAdapter {
  readonly name = "claude-code" as const;

  constructor(private readonly runner: CommandRunner = unavailableRunner) {}

  async render(input: RuntimeRenderInput): Promise<ClaudeRenderedPackage> {
    const { loop } = input;
    const skills = input.skills ?? [`${loop.id}-loop`];
    const permissions = { allow: [...(input.allowedTools ?? [])].sort() };
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
      .map((trigger) => `${trigger.type}: invoke claude with loop id and idempotency key`);
    const cycle = promptCycle(loop.id);
    const workDirectory = input.workDirectory ?? `loops/${loop.id}`;
    const graphPackage = input.graph === undefined ? undefined : renderGraphExecution(input.graph, this.name, loop.id, {
      freshSessions: true,
      sequentialFallback: true,
      maxConcurrency: input.graph.budgets.maxConcurrency,
      dynamicWorkflow: "optional",
    });
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
      permissions,
      externalTriggerRequirements,
      workDirectory,
      ...(graphPackage === undefined ? {} : { graphExecution: graphPackage.execution }),
    };
    return {
      ...portable,
      files: {
        "runtime.json": `${JSON.stringify(portable, null, 2)}\n`,
        "plugin.json": `${JSON.stringify({ name: `loopstack-${loop.id}`, version: String(loop.version), skills: "./skills/" }, null, 2)}\n`,
        "permissions.json": `${JSON.stringify(permissions, null, 2)}\n`,
        "skill-wrapper.md": `Run ${skills.join(", ")}. Preserve handoffs and stop for every declared approval.\n`,
        ...(graphPackage === undefined ? {} : {
          "graph.json": graphPackage.graphFile,
          "graph-binding.json": `${JSON.stringify(graphPackage.execution, null, 2)}\n`,
        }),
      },
    };
  }

  async preflight(input: RuntimePreflightInput): Promise<RuntimePreflight> {
    const [cli, project, skills, tools] = await Promise.all([
      this.runner("claude", ["--version"]),
      this.runner("claude", ["config", "list"]),
      this.runner("claude", ["plugin", "list"]),
      this.runner("claude", ["mcp", "list"]),
    ]);
    const blockers: string[] = [];
    if (cli.exitCode !== 0) blockers.push("claude_cli");
    if (project.exitCode !== 0) blockers.push("project_settings");
    if (skills.exitCode !== 0) blockers.push("skills_directory");
    if (input.requiredTools.length > 0 && tools.exitCode !== 0) blockers.push("required_tools");
    return {
      runtime: this.name,
      cliPresent: cli.exitCode === 0,
      authenticatedProfile: project.exitCode === 0,
      skillsDirectory: skills.exitCode === 0,
      triggerSupport: { manual: true, cron: false, webhook: false, event: false, queue: false },
      approvalSupport: true,
      deliveryTargetStatus: input.deliveryTarget ? "untested" : "ready",
      blockers,
    };
  }

  async validate(packagePath: string): Promise<RuntimeValidation> {
    try {
      await access(`${packagePath}/runtime.json`, constants.R_OK);
      JSON.parse(await readFile(`${packagePath}/runtime.json`, "utf8"));
      return { valid: true, errors: [] };
    } catch (error) {
      return { valid: false, errors: [error instanceof Error ? error.message : String(error)] };
    }
  }
}
