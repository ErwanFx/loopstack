import { z } from "zod";
import type { LoopDefinition } from "../domain/types.js";

export const ArgumentCommandSchema = z.object({
  executable: z.string().min(1),
  args: z.array(z.string()),
});

export const ActivationPlanSchema = z.object({
  schemaVersion: z.literal(1),
  runtime: z.literal("hermes"),
  loopId: z.string().min(1),
  enabled: z.literal(false),
  controller: ArgumentCommandSchema,
  skills: z.array(z.string().min(1)).min(1),
  deliveryTarget: z.string().min(1),
  triggers: z.array(z.object({
    id: z.string().min(1),
    type: z.enum(["cron", "webhook"]),
    enabled: z.literal(false),
    activation: ArgumentCommandSchema,
    verification: z.array(ArgumentCommandSchema).min(1),
    removal: ArgumentCommandSchema,
    security: z.object({
      hmacRequired: z.boolean(),
      secretEnv: z.string().min(1).nullable(),
      idempotencyHeader: z.string().min(1).nullable(),
      idempotencyKey: z.string().min(1).nullable(),
    }),
  })),
});

export type ActivationPlan = z.infer<typeof ActivationPlanSchema>;

function webhookSecretEnv(loopId: string): string {
  return `LOOPSTACK_${loopId.replaceAll("-", "_").toUpperCase()}_WEBHOOK_SECRET`;
}

export function createHermesActivationPlan(
  loop: LoopDefinition,
  options: { skills?: string[]; deliveryTarget?: string } = {},
): ActivationPlan {
  const controller = {
    executable: "loopstack",
    args: ["prompt-cycle", "run", "--loop", loop.id],
  };
  const secretEnv = webhookSecretEnv(loop.id);
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
            "cron", "create", "--id", id, "--schedule", schedule, "--",
            controller.executable, ...controller.args,
          ],
        },
        verification: [
          { executable: "hermes", args: ["cron", "list", "--json"] },
          { executable: "hermes", args: ["cron", "test", id] },
        ],
        removal: { executable: "hermes", args: ["cron", "remove", id] },
        security: {
          hmacRequired: false,
          secretEnv: null,
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
          "webhook", "subscribe", "--id", id,
          "--route", `/loopstack/${loop.id}`,
          "--secret-env", secretEnv,
          "--idempotency-header", "x-loopstack-idempotency-key",
          "--", controller.executable, ...controller.args,
        ],
      },
      verification: [
        { executable: "hermes", args: ["webhook", "list", "--json"] },
        { executable: "hermes", args: ["webhook", "test", id] },
      ],
      removal: { executable: "hermes", args: ["webhook", "remove", id] },
      security: {
        hmacRequired: true,
        secretEnv,
        idempotencyHeader: "x-loopstack-idempotency-key",
        idempotencyKey: trigger.idempotencyKey ?? null,
      },
    }];
  });

  return ActivationPlanSchema.parse({
    schemaVersion: 1,
    runtime: "hermes",
    loopId: loop.id,
    enabled: false,
    controller,
    skills: options.skills ?? [`${loop.id}-loop`],
    deliveryTarget: options.deliveryTarget ?? "log",
    triggers,
  });
}
