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
import { ActivationPlanSchema, createHermesActivationPlan, type ActivationPlan } from "./activation-plan.js";
import { renderGraphExecution } from "./graph-execution.js";
import { generatedLoopSkillName, safeDisplayName } from "./render-helpers.js";
import { hermesHasEnabledTool, listHasExactIdentifier } from "./preflight-inspection.js";
import { addPackageIntegrityManifest, validatePackageIntegrity } from "./package-integrity.js";

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

function selectedProfile(input: {
  profile?: string;
  graph?: RuntimeRenderInput["graph"];
}): string | undefined {
  if (input.profile !== undefined) {
    if (!/^[a-z0-9][a-z0-9_-]{0,63}$/.test(input.profile)) throw new Error(`Invalid Hermes profile: ${input.profile}`);
    return input.profile;
  }
  const profiles = new Set(
    input.graph?.agents.map((agent) => agent.profile).filter((value): value is string => value !== undefined) ?? [],
  );
  for (const profile of profiles) {
    if (!/^[a-z0-9][a-z0-9_-]{0,63}$/.test(profile)) throw new Error(`Invalid Hermes profile: ${profile}`);
  }
  return profiles.size === 1 ? [...profiles][0] : undefined;
}

export class HermesRuntimeAdapter implements RuntimeAdapter {
  readonly name = "hermes" as const;

  constructor(private readonly runner: CommandRunner = unavailableRunner) {}

  async render(input: RuntimeRenderInput): Promise<HermesRenderedPackage> {
    const { loop } = input;
    const skills = input.skills ?? [generatedLoopSkillName(loop.id)];
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
    const workDirectory = input.workDirectory ?? `loops/${loop.id}`;
    const profile = selectedProfile(input);
    const cycle = promptCycle(workDirectory);
    const activationPlan = createHermesActivationPlan(loop, {
      skills,
      deliveryTarget,
      workDirectory,
      ...(profile === undefined ? {} : { profile }),
    });
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
      ...(profile === undefined ? {} : { profile }),
      ...(graphPackage === undefined ? {} : { graphExecution: graphPackage.execution }),
    };
    return {
      ...portable,
      activationPlan,
      files: addPackageIntegrityManifest(this.name, loop.id, loop.version, {
        "runtime.json": `${JSON.stringify(portable, null, 2)}\n`,
        "webhook-route.yaml": `route: ${webhook.route}\nsecret_env: ${secretEnv}\nenabled: false\n`,
        "cron-job.yaml": `loop_id: ${loop.id}\nenabled: false\n`,
        "activation-plan.json": `${JSON.stringify(activationPlan, null, 2)}\n`,
        "skill-wrapper.md": `Run ${skills.join(", ")} for loop ${safeDisplayName(loop.name)} (${loop.id}). Preserve approval handoffs.\n`,
        ...(graphPackage === undefined ? {} : {
          "graph.json": graphPackage.graphFile,
          "graph-binding.json": `${JSON.stringify(graphPackage.execution, null, 2)}\n`,
        }),
      }),
    };
  }

  async preflight(input: RuntimePreflightInput): Promise<RuntimePreflight> {
    const profileName = selectedProfile(input);
    const scoped = (args: string[]): string[] => profileName === undefined ? args : ["-p", profileName, ...args];
    const [cli, profile, gateway, skills, tools, webhook] = await Promise.all([
      this.runner("hermes", ["--help"]),
      this.runner("hermes", ["profile", "list"]),
      this.runner("hermes", scoped(["gateway", "status"])),
      this.runner("hermes", scoped(["skills", "list", "--enabled-only"])),
      this.runner("hermes", scoped(["tools", "list"])),
      this.runner("hermes", scoped(["webhook", "list"])),
    ]);
    const blockers: string[] = [];
    if (cli.exitCode !== 0) blockers.push("hermes_cli");
    if (profile.exitCode !== 0) blockers.push("authenticated_profile");
    if (skills.exitCode !== 0) blockers.push("skills_directory");
    if (input.requiredTools.length > 0 && tools.exitCode !== 0) blockers.push("required_tools");
    const webhookOutput = `${webhook.stdout}\n${webhook.stderr}`;
    const cronReady = gateway.exitCode === 0;
    const webhookReady = gateway.exitCode === 0
      && webhook.exitCode === 0
      && !/not enabled|disabled/i.test(webhookOutput);
    if (input.loop.triggers.some((trigger) => trigger.type === "cron") && !cronReady) blockers.push("cron_gateway");
    if (input.loop.triggers.some((trigger) => trigger.type === "webhook") && !webhookReady) blockers.push("webhook_gateway");

    const requiredProfiles = new Set([
      ...(input.profile === undefined ? [] : [input.profile]),
      ...(input.graph?.agents.map((agent) => agent.profile).filter((value): value is string => value !== undefined) ?? []),
    ]);
    const requiredSkills = new Set([
      ...input.requiredSkills,
      ...(input.graph?.agents.flatMap((agent) => agent.requiredSkills) ?? []),
    ]);
    if (profile.exitCode === 0) for (const required of requiredProfiles) {
      if (!listHasExactIdentifier(profile.stdout, required)) blockers.push(`profile:${required}`);
    }
    if (skills.exitCode === 0) for (const required of requiredSkills) {
      if (!listHasExactIdentifier(skills.stdout, required)) blockers.push(`skill:${required}`);
    }
    if (tools.exitCode === 0) for (const required of input.requiredTools) {
      if (!hermesHasEnabledTool(tools.stdout, required)) blockers.push(`tool:${required}`);
    }

    return {
      runtime: this.name,
      cliPresent: cli.exitCode === 0,
      authenticatedProfile: profile.exitCode === 0 && !blockers.some((blocker) => blocker.startsWith("profile:")),
      skillsDirectory: skills.exitCode === 0,
      triggerSupport: { manual: true, cron: cronReady, webhook: webhookReady, event: false, queue: false },
      approvalSupport: true,
      deliveryTargetStatus: input.deliveryTarget && input.deliveryTarget !== "log" ? "untested" : "ready",
      blockers,
    };
  }

  async validate(packagePath: string): Promise<RuntimeValidation> {
    try {
      const integrity = await validatePackageIntegrity(packagePath, this.name);
      if (integrity.manifest === null || integrity.errors.length > 0) {
        return { valid: false, errors: integrity.errors };
      }
      await access(`${packagePath}/runtime.json`, constants.R_OK);
      const runtime = JSON.parse(await readFile(`${packagePath}/runtime.json`, "utf8")) as Record<string, unknown>;
      const activationPlan = ActivationPlanSchema.parse(
        JSON.parse(await readFile(`${packagePath}/activation-plan.json`, "utf8")),
      );
      if (runtime.runtime !== "hermes") throw new Error("runtime.json must declare the hermes runtime");
      if (typeof runtime.loopId !== "string" || runtime.loopId !== activationPlan.loopId) {
        throw new Error("runtime.json and activation-plan.json loop ids must match");
      }
      if (runtime.loopId !== integrity.manifest.loopId || activationPlan.loopId !== integrity.manifest.loopId) {
        throw new Error("runtime and activation plan loop ids must match package manifest loopId");
      }
      if (runtime.version !== integrity.manifest.version || activationPlan.version !== integrity.manifest.version) {
        throw new Error("runtime and activation plan versions must match package manifest version");
      }
      return { valid: true, errors: [] };
    } catch (error) {
      return { valid: false, errors: [error instanceof Error ? error.message : String(error)] };
    }
  }
}
