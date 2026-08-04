import { z } from "zod";
import { resolve } from "node:path";
import type { LoopDefinition } from "../domain/types.js";
import { generatedLoopSkillName } from "./render-helpers.js";

export const ArgumentCommandSchema = z.object({
  executable: z.string().min(1),
  args: z.array(z.string()),
});

export const ActivationPlanSchema = z.object({
  schemaVersion: z.literal(1),
  runtime: z.literal("hermes"),
  loopId: z.string().min(1),
  version: z.number().int().nonnegative(),
  enabled: z.literal(false),
  controller: ArgumentCommandSchema,
  skills: z.array(z.string().min(1)).min(1),
  profile: z.string().regex(/^[a-z0-9][a-z0-9_-]{0,63}$/).nullable().default(null),
  deliveryTarget: z.string().min(1),
  triggers: z.array(z.object({
    id: z.string().min(1),
    type: z.enum(["cron", "webhook"]),
    enabled: z.literal(false),
    activation: ArgumentCommandSchema,
    verification: z.array(ArgumentCommandSchema).min(1),
    removal: ArgumentCommandSchema,
    outputBindings: z.object({
      job_id: z.object({ source: z.literal("activation"), jsonPath: z.literal("$.job_id") }),
    }).optional(),
    security: z.object({
      hmacRequired: z.boolean(),
      secretEnv: z.string().min(1).nullable(),
      secretManagement: z.enum(["none", "hermes-generated"]),
      idempotencyHeader: z.string().min(1).nullable(),
      idempotencyKey: z.string().min(1).nullable(),
    }),
  })),
});

export type ActivationPlan = z.infer<typeof ActivationPlanSchema>;

export function interpolateActivationCommand(
  command: z.infer<typeof ArgumentCommandSchema>,
  outputBindings: ActivationPlan["triggers"][number]["outputBindings"],
  activationOutput: Record<string, unknown>,
): z.infer<typeof ArgumentCommandSchema> {
  let args = [...command.args];
  for (const [key, binding] of Object.entries(outputBindings ?? {})) {
    const outputKey = binding.jsonPath.startsWith("$.") ? binding.jsonPath.slice(2) : "";
    const value = activationOutput[outputKey];
    if ((typeof value !== "string" && typeof value !== "number") || String(value).length === 0) {
      throw new Error(`Missing activation output for ${binding.jsonPath}`);
    }
    args = args.map((argument) => argument.split(`{{${key}}}`).join(String(value)));
  }
  return ArgumentCommandSchema.parse({ executable: command.executable, args });
}

export function createHermesActivationPlan(
  loop: LoopDefinition,
  options: { skills?: string[]; deliveryTarget?: string; workDirectory?: string; profile?: string } = {},
): ActivationPlan {
  const skills = options.skills ?? [generatedLoopSkillName(loop.id)];
  const deliveryTarget = options.deliveryTarget ?? "log";
  const cronDeliveryTarget = deliveryTarget === "log" ? "local" : deliveryTarget;
  const profile = options.profile ?? null;
  const profileArgs = profile === null ? [] : ["-p", profile];
  const workDirectory = resolve(options.workDirectory ?? `loops/${loop.id}`);
  const controller = {
    executable: "loopstack",
    args: ["prompt-cycle", "run", "--loop", workDirectory],
  };
  const controllerPrompt = `Execute loopstack prompt-cycle run --loop ${JSON.stringify(workDirectory)} exactly once. Return its JSON outcome and do not bypass approvals.`;
  const triggers = loop.triggers.flatMap<ActivationPlan["triggers"][number]>((trigger, index) => {
    if (trigger.type !== "cron" && trigger.type !== "webhook") return [];
    const id = trigger.id ?? `${trigger.type}-${index + 1}`;
    if (trigger.type === "cron") {
      const schedule = trigger.configuration?.schedule;
      if (typeof schedule !== "string" || schedule.length === 0) {
        throw new Error(`Hermes cron trigger ${id} requires configuration.schedule`);
      }
      return [{
        id,
        type: "cron" as const,
        enabled: false as const,
        activation: {
          executable: "hermes",
          args: [
            ...profileArgs, "cron", "create", schedule, controllerPrompt,
            "--name", id,
            "--deliver", cronDeliveryTarget,
            ...skills.flatMap((skill) => ["--skill", skill]),
            "--workdir", workDirectory,
          ],
        },
        verification: [
          { executable: "hermes", args: [...profileArgs, "cron", "list", "--all"] },
        ],
        removal: { executable: "hermes", args: [...profileArgs, "cron", "remove", "{{job_id}}"] },
        outputBindings: { job_id: { source: "activation" as const, jsonPath: "$.job_id" as const } },
        security: {
          hmacRequired: false,
          secretEnv: null,
          secretManagement: "none" as const,
          idempotencyHeader: null,
          idempotencyKey: trigger.idempotencyKey ?? null,
        },
      }];
    }

    return [{
      id,
      type: "webhook" as const,
      enabled: false as const,
      activation: {
        executable: "hermes",
        args: [
          ...profileArgs, "webhook", "subscribe", id,
          "--prompt", `${controllerPrompt} Treat the verified webhook payload as the run observation.`,
          ...(trigger.event === undefined ? [] : ["--events", trigger.event]),
          "--description", `Loopstack trigger for ${loop.name}`,
          "--skills", skills.join(","),
          "--deliver", deliveryTarget,
        ],
      },
      verification: [
        { executable: "hermes", args: [...profileArgs, "webhook", "list"] },
      ],
      removal: { executable: "hermes", args: [...profileArgs, "webhook", "remove", id] },
      security: {
        hmacRequired: true,
        secretEnv: null,
        secretManagement: "hermes-generated" as const,
        idempotencyHeader: null,
        idempotencyKey: trigger.idempotencyKey ?? null,
      },
    }];
  });

  return ActivationPlanSchema.parse({
    schemaVersion: 1,
    runtime: "hermes",
    loopId: loop.id,
    version: loop.version,
    enabled: false,
    controller,
    skills,
    profile,
    deliveryTarget,
    triggers,
  });
}
