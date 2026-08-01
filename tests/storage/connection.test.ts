import { describe, expect, it } from "vitest";
import { evaluateNativeConnection } from "../../src/storage/connection.js";

const base = {
  provider: "convex" as const,
  runtime: "hermes" as const,
  capability: { kind: "mcp" as const, name: "convex" },
  authenticated: true,
  permissions: { read: true, schemaWrite: true },
  checkedAt: "2026-08-01T12:00:00.000Z",
  evidence: "profile authenticated; schema metadata readable; values redacted",
  alertChannelTested: true,
};

describe("native connection evidence gate", () => {
  it("blocks provisioning when schema-write permission is missing", () => {
    const report = evaluateNativeConnection({ ...base, permissions: { read: true, schemaWrite: false } });
    expect(report.status).toBe("blocked");
    expect(report.blockers).toContain("schema_write_permission");
  });

  it("accepts an authenticated and tested Airtable native capability", () => {
    const report = evaluateNativeConnection({
      ...base,
      provider: "airtable",
      capability: { kind: "skill", name: "airtable-cli" },
    });
    expect(report).toMatchObject({ status: "ready", blockers: [] });
  });

  it("rejects credential-shaped content in evidence", () => {
    const report = evaluateNativeConnection({ ...base, evidence: "api_key=abc123-not-redacted" });
    expect(report.status).toBe("blocked");
    expect(report.blockers).toContain("credential_exposure");
  });

  it("requires fresh authenticated read evidence and a tested alert channel", () => {
    const report = evaluateNativeConnection({
      ...base,
      authenticated: false,
      permissions: { read: false, schemaWrite: true },
      alertChannelTested: false,
    });
    expect(report.blockers).toEqual(expect.arrayContaining(["authentication", "read_permission", "tested_alert_channel"]));
  });
});
