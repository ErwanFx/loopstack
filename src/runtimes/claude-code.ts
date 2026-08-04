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
import { validateRuntimePackage } from "./package-validation.js";
import { claudeHasEnabledPlugin, textHasIdentifier } from "./preflight-inspection.js";
import { generatedLoopSkillName, renderGeneratedLoopSkill, safeDisplayName } from "./render-helpers.js";

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
    const wrapperName = generatedLoopSkillName(loop.id);
    const skills = input.skills ?? [wrapperName];
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
    const workDirectory = input.workDirectory ?? `loops/${loop.id}`;
    const cycle = promptCycle(workDirectory);
    const graphPackage = input.graph === undefined ? undefined : renderGraphExecution(input.graph, this.name, loop.id, {
      freshSessions: true,
      sequentialFallback: true,
      maxConcurrency: input.graph.budgets.maxConcurrency,
      dynamicWorkflow: "optional",
    });
    const displayName = safeDisplayName(loop.name);
    const pluginVersion = `${loop.version}.0.0`;
    const wrapperSkill = renderGeneratedLoopSkill(loop.id, loop.name, skills);
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
        ".claude-plugin/plugin.json": `${JSON.stringify({
          name: `loopstack-${loop.id}`,
          version: pluginVersion,
          description: `Claude Code runtime wrapper for ${displayName}`,
          author: { name: "Loopstack" },
        }, null, 2)}\n`,
        "permissions.json": `${JSON.stringify(permissions, null, 2)}\n`,
        [`skills/${wrapperName}/SKILL.md`]: wrapperSkill,
        ...(graphPackage === undefined ? {} : {
          "graph.json": graphPackage.graphFile,
          "graph-binding.json": `${JSON.stringify(graphPackage.execution, null, 2)}\n`,
        }),
      },
    };
  }

  async preflight(input: RuntimePreflightInput): Promise<RuntimePreflight> {
    const [cli, authentication, plugins, tools] = await Promise.all([
      this.runner("claude", ["--version"]),
      this.runner("claude", ["auth", "status"]),
      this.runner("claude", ["plugin", "list", "--json"]),
      this.runner("claude", ["mcp", "list"]),
    ]);
    const blockers: string[] = [];
    if (cli.exitCode !== 0) blockers.push("claude_cli");
    const authenticated = authentication.exitCode === 0
      && !/"loggedIn"\s*:\s*false|not logged in/i.test(`${authentication.stdout}\n${authentication.stderr}`);
    if (!authenticated) blockers.push("authenticated_profile");
    if (plugins.exitCode !== 0) blockers.push("skills_directory");
    const wrapperName = `loopstack-${input.loop.id}`;
    const wrapperReady = plugins.exitCode === 0 && claudeHasEnabledPlugin(plugins.stdout, wrapperName);
    if (!wrapperReady) blockers.push(`runtime_package:${wrapperName}`);
    if (input.requiredTools.length > 0 && tools.exitCode !== 0) blockers.push("required_tools");
    if (tools.exitCode === 0) for (const required of input.requiredTools) {
      if (!textHasIdentifier(tools.stdout, required)) blockers.push(`tool:${required}`);
    }
    return {
      runtime: this.name,
      cliPresent: cli.exitCode === 0,
      authenticatedProfile: authenticated,
      skillsDirectory: wrapperReady,
      triggerSupport: { manual: true, cron: false, webhook: false, event: false, queue: false },
      approvalSupport: true,
      deliveryTargetStatus: input.deliveryTarget ? "untested" : "ready",
      blockers,
    };
  }

  async validate(packagePath: string): Promise<RuntimeValidation> {
    return validateRuntimePackage(packagePath, this.name);
  }
}
