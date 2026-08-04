import { describe, expect, it } from "vitest";
import { resolve } from "node:path";
import { LoopDefinitionSchema } from "../../src/domain/schemas.js";
import {
  ActivationPlanSchema,
  createHermesActivationPlan,
  interpolateActivationCommand,
} from "../../src/runtimes/activation-plan.js";
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
      profile: "pv-admin",
    });
    expect(ActivationPlanSchema.parse(plan)).toEqual(plan);
    expect(plan.enabled).toBe(false);
    expect(plan.controller).toEqual({
      executable: "loopstack",
      args: ["prompt-cycle", "run", "--loop", resolve("loops/pv-admin")],
    });
    expect(plan.skills).toEqual(["pv-admin-playbook", "document-qa"]);
    expect(plan.deliveryTarget).toBe("slack:ops-alerts");
    expect(plan.profile).toBe("pv-admin");

    const cron = plan.triggers.find(({ id }) => id === "weekly-review")!;
    expect(cron.activation).toEqual({
      executable: "hermes",
      args: [
        "-p", "pv-admin", "cron", "create", "0 8 * * 1",
        expect.stringContaining("loopstack prompt-cycle run"),
        "--name", "loopstack:pv-admin:pv-admin:v1:weekly-review",
        "--deliver", "slack:ops-alerts",
        "--skill", "pv-admin-playbook",
        "--skill", "document-qa",
        "--workdir", resolve("loops/pv-admin"),
      ],
    });
    expect(cron.verification).toEqual([{ executable: "hermes", args: ["-p", "pv-admin", "cron", "list", "--all"] }]);
    expect(cron.removal.args).toEqual(["-p", "pv-admin", "cron", "remove", "{{job_id}}"]);
    expect(cron.outputBindings).toEqual({ job_id: { source: "activation", jsonPath: "$.job_id" } });
    expect(interpolateActivationCommand(cron.removal, cron.outputBindings, { job_id: "job-123" })).toEqual({
      executable: "hermes",
      args: ["-p", "pv-admin", "cron", "remove", "job-123"],
    });

    const webhook = plan.triggers.find(({ id }) => id === "visit-validated")!;
    expect(webhook.activation.args).toEqual([
      "-p", "pv-admin", "webhook", "subscribe", "visit-validated",
      "--prompt", expect.stringContaining("loopstack prompt-cycle run"),
      "--events", "visit.validated",
      "--description", "Loopstack trigger for PV administration",
      "--skills", "pv-admin-playbook,document-qa",
      "--deliver", "slack:ops-alerts",
    ]);
    expect(webhook.security).toMatchObject({
      hmacRequired: true,
      secretEnv: null,
      secretManagement: "hermes-generated",
      idempotencyKey: "client+version",
    });
    expect(webhook.verification).toEqual([{ executable: "hermes", args: ["-p", "pv-admin", "webhook", "list"] }]);
    expect(webhook.removal.args).toEqual(["-p", "pv-admin", "webhook", "remove", "visit-validated"]);
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
