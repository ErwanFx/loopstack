import { describe, expect, it } from "vitest";
import { LoopDefinitionSchema } from "../../src/domain/schemas.js";
import { ActivationPlanSchema, createHermesActivationPlan } from "../../src/runtimes/activation-plan.js";
import { HermesRuntimeAdapter } from "../../src/runtimes/hermes.js";

const loop = LoopDefinitionSchema.parse({
  id: "pv-admin",
  name: "PV administration",
  version: 1,
  status: "ready",
  target: { metric: "dossier_cycle_hours", desired: 192, direction: "at-most", horizonDays: 90 },
  current: { value: 260, observedAt: "2026-08-01T00:00:00.000Z" },
  triggers: [
    { id: "weekly-review", type: "cron", configuration: { schedule: "0 8 * * 1" }, idempotencyKey: "week" },
    { id: "visit-validated", type: "webhook", source: "crm", event: "visit.validated", idempotencyKey: "client+version" },
  ],
  feedback: [{ metric: "dossier_cycle_hours", delayDays: 30 }],
});

describe("inert Hermes activation plans", () => {
  it("uses executable and argument arrays for activation, verification, and removal", () => {
    const plan = createHermesActivationPlan(loop, {
      skills: ["pv-admin-playbook", "document-qa"],
      deliveryTarget: "slack:ops-alerts",
    });
    expect(ActivationPlanSchema.parse(plan)).toEqual(plan);
    expect(plan.enabled).toBe(false);
    expect(plan.controller).toEqual({
      executable: "loopstack",
      args: ["prompt-cycle", "run", "--loop", "pv-admin"],
    });
    expect(plan.skills).toEqual(["pv-admin-playbook", "document-qa"]);
    expect(plan.deliveryTarget).toBe("slack:ops-alerts");

    const cron = plan.triggers.find(({ id }) => id === "weekly-review")!;
    expect(cron.activation).toEqual({
      executable: "hermes",
      args: [
        "cron", "create", "--id", "weekly-review", "--schedule", "0 8 * * 1", "--",
        "loopstack", "prompt-cycle", "run", "--loop", "pv-admin",
      ],
    });
    expect(cron.verification.map(({ args }) => args.slice(0, 2))).toEqual([
      ["cron", "list"], ["cron", "test"],
    ]);
    expect(cron.removal.args).toEqual(["cron", "remove", "weekly-review"]);

    const webhook = plan.triggers.find(({ id }) => id === "visit-validated")!;
    expect(webhook.activation.args).toEqual(expect.arrayContaining([
      "webhook", "subscribe", "--secret-env", "LOOPSTACK_PV_ADMIN_WEBHOOK_SECRET",
      "--idempotency-header", "x-loopstack-idempotency-key",
    ]));
    expect(webhook.security).toMatchObject({
      hmacRequired: true,
      idempotencyKey: "client+version",
    });
    expect(webhook.removal.args).toEqual(["webhook", "remove", "visit-validated"]);
  });

  it("renders plans as artifacts without executing any command", async () => {
    const calls: unknown[] = [];
    const rendered = await new HermesRuntimeAdapter(async (...args) => {
      calls.push(args);
      return { exitCode: 0, stdout: "", stderr: "" };
    }).render({ loop, skills: ["pv-admin-playbook"] });

    expect(calls).toEqual([]);
    const plan = ActivationPlanSchema.parse(JSON.parse(rendered.files["activation-plan.json"]));
    expect(plan.enabled).toBe(false);
    expect(plan.triggers.every((trigger) => trigger.enabled === false)).toBe(true);
  });
});
