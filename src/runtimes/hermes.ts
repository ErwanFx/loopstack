import { access, readFile } from "node:fs/promises";
import { constants } from "node:fs";
import type {
  CommandRunner,
  RenderedRuntimePackage,
  RuntimeAdapter,
  RuntimePreflight,
  RuntimePreflightInput,
  RuntimeRenderInput,
  RuntimeValidation,
} from "./types.js";

type HermesRenderedPackage = RenderedRuntimePackage & {
  webhook: { route: string; secretEnv: string; skills: string[]; idempotencyHeader: string };
  deliveryTarget: string;
};

const unavailableRunner: CommandRunner = async () => ({ exitCode: 1, stdout: "", stderr: "runner unavailable" });

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
      webhook,
      deliveryTarget: "log",
      workDirectory: input.workDirectory ?? `loops/${loop.id}`,
    };
    return {
      ...portable,
      files: {
        "runtime.json": `${JSON.stringify(portable, null, 2)}\n`,
        "webhook-route.yaml": `route: ${webhook.route}\nsecret_env: ${secretEnv}\nenabled: false\n`,
        "cron-job.yaml": `loop_id: ${loop.id}\nenabled: false\n`,
        "skill-wrapper.md": `Run ${skills.join(", ")} for loop ${loop.id}. Preserve approval handoffs.\n`,
      },
    };
  }

  async preflight(input: RuntimePreflightInput): Promise<RuntimePreflight> {
    const [cli, profile, gateway, skills] = await Promise.all([
      this.runner("hermes", ["--help"]),
      this.runner("hermes", ["profile", "current"]),
      this.runner("hermes", ["gateway", "health"]),
      this.runner("hermes", ["skills", "list"]),
    ]);
    const blockers: string[] = [];
    if (cli.exitCode !== 0) blockers.push("hermes_cli");
    if (profile.exitCode !== 0) blockers.push("authenticated_profile");
    if (skills.exitCode !== 0) blockers.push("skills_directory");
    if (input.loop.triggers.some((trigger) => trigger.type === "webhook") && gateway.exitCode !== 0) blockers.push("webhook_gateway");

    return {
      runtime: this.name,
      cliPresent: cli.exitCode === 0,
      authenticatedProfile: profile.exitCode === 0,
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
