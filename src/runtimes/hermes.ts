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
import { createHermesActivationPlan, type ActivationPlan } from "./activation-plan.js";
import { renderGraphExecution } from "./graph-execution.js";

type HermesRenderedPackage = RenderedRuntimePackage & {
  webhook: { route: string; secretEnv: string; skills: string[]; idempotencyHeader: string };
  deliveryTarget: string;
  activationPlan: ActivationPlan;
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

export class HermesRuntimeAdapter implements RuntimeAdapter {
  readonly name = "hermes" as const;

  constructor(private readonly runner: CommandRunner = unavailableRunner) {}

  async render(input: RuntimeRenderInput): Promise<HermesRenderedPackage> {
    const { loop } = input;
    const skills = input.skills ?? [`${loop.id}-loop`];
    const secretEnv = `LOOPSTACK_${loop.id.replaceAll("-", "_").toUpperCase()}_WEBHOOK_SECRET`;
    const triggers = loop.triggers.map((trigger) => ({
      type: trigger.type === "cron" ? "schedule" : trigger.type,
      enabled: false as const,
      ...(trigger.id === undefined ? {} : { id: trigger.id }),
      role: trigger.role,
      ...(trigger.source === undefined ? {} : { source: trigger.source }),
      ...(trigger.event === undefined ? {} : { event: trigger.event }),
      ...(trigger.idempotencyKey === undefined ? {} : { idempotencyKey: trigger.idempotencyKey }),
      ...(trigger.debounceSeconds === undefined ? {} : { debounceSeconds: trigger.debounceSeconds }),
      ...(trigger.replayWindowHours === undefined ? {} : { replayWindowHours: trigger.replayWindowHours }),
      ...(trigger.payloadSchemaRef === undefined ? {} : { payloadSchemaRef: trigger.payloadSchemaRef }),
      ...(trigger.type === "cron" && typeof trigger.configuration?.schedule === "string"
        ? { schedule: trigger.configuration.schedule }
        : {}),
    }));
    const webhook = {
      route: `/loopstack/${loop.id}`,
      secretEnv,
      skills,
      idempotencyHeader: "x-loopstack-idempotency-key",
    };
    const deliveryTarget = input.deliveryTarget ?? "log";
    const cycle = promptCycle(loop.id);
    const workDirectory = input.workDirectory ?? `loops/${loop.id}`;
    const activationPlan = createHermesActivationPlan(loop, { skills, deliveryTarget });
    const graphPackage = input.graph === undefined ? undefined : renderGraphExecution(input.graph, this.name, loop.id, {
      freshSessions: true,
      sequentialFallback: true,
      maxConcurrency: 1,
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
      webhook,
      deliveryTarget,
      workDirectory,
      ...(graphPackage === undefined ? {} : { graphExecution: graphPackage.execution }),
    };
    return {
      ...portable,
      activationPlan,
      files: {
        "runtime.json": `${JSON.stringify(portable, null, 2)}\n`,
        "webhook-route.yaml": `route: ${webhook.route}\nsecret_env: ${secretEnv}\nenabled: false\n`,
        "cron-job.yaml": `loop_id: ${loop.id}\nenabled: false\n`,
        "activation-plan.json": `${JSON.stringify(activationPlan, null, 2)}\n`,
        "skill-wrapper.md": `Run ${skills.join(", ")} for loop ${loop.id}. Preserve approval handoffs.\n`,
        ...(graphPackage === undefined ? {} : {
          "graph.json": graphPackage.graphFile,
          "graph-binding.json": `${JSON.stringify(graphPackage.execution, null, 2)}\n`,
        }),
      },
    };
  }

  async preflight(input: RuntimePreflightInput): Promise<RuntimePreflight> {
    const [cli, profile, gateway, skills] = await Promise.all([
      this.runner("hermes", ["--help"]),
      this.runner("hermes", ["profile", "list"]),
      this.runner("hermes", ["gateway", "health"]),
      this.runner("hermes", ["skills", "list"]),
    ]);
    const blockers: string[] = [];
    if (cli.exitCode !== 0) blockers.push("hermes_cli");
    if (profile.exitCode !== 0) blockers.push("authenticated_profile");
    if (skills.exitCode !== 0) blockers.push("skills_directory");
    if (input.loop.triggers.some((trigger) => trigger.type === "webhook") && gateway.exitCode !== 0) blockers.push("webhook_gateway");

    const requiredProfiles = new Set([
      ...(input.profile === undefined ? [] : [input.profile]),
      ...(input.graph?.agents.map((agent) => agent.profile).filter((value): value is string => value !== undefined) ?? []),
    ]);
    const requiredSkills = new Set([
      ...input.requiredSkills,
      ...(input.graph?.agents.flatMap((agent) => agent.requiredSkills) ?? []),
    ]);
    if (profile.exitCode === 0) for (const required of requiredProfiles) {
      if (!profile.stdout.includes(required)) blockers.push(`profile:${required}`);
    }
    if (skills.exitCode === 0) for (const required of requiredSkills) {
      if (!skills.stdout.includes(required)) blockers.push(`skill:${required}`);
    }

    return {
      runtime: this.name,
      cliPresent: cli.exitCode === 0,
      authenticatedProfile: profile.exitCode === 0 && !blockers.some((blocker) => blocker.startsWith("profile:")),
      skillsDirectory: skills.exitCode === 0,
      triggerSupport: { manual: true, cron: true, webhook: gateway.exitCode === 0, event: true, queue: true },
      approvalSupport: true,
      deliveryTargetStatus: input.deliveryTarget && input.deliveryTarget !== "log" ? "untested" : "ready",
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
