# Loopstack Native Storage Design

## Decision

Loopstack does not implement provider API clients for Convex, Airtable, or Google Sheets. Hermes Agent or Claude Code uses its existing MCP, CLI, skill, or authenticated tool connection. Loopstack supplies the provider-neutral data contract, provider-specific blueprints, connection checks, approval boundaries, and verification.

This replaces the custom-adapter portion of the original storage plan. The user selected this approach after comparing it with full embedded clients and a files-only implementation.

## Data model

All loops normally share the same logical entities and are separated by `loopId`:

- loops and loop versions;
- runs and events;
- observations, decisions, actions, and action results;
- approvals, evaluations, alerts, learnings, costs, heartbeats, and tool connections.

Every operational record carries `loopId`, `runId`, `eventId`, an ISO timestamp, and an idempotency key where applicable. Decision and event histories are append-only.

Provider defaults:

- Convex: one deployment with shared tables and indexes;
- Airtable: one “AI Loops” base with shared linked tables;
- Google Sheets: one spreadsheet per loop for prototypes, with one worksheet per entity and a hidden schema worksheet.

Isolation by client or compliance boundary remains an explicit design option.

## Skills and deterministic tooling

`loop-storage-design` selects a provider and produces `storage.yaml` plus the required schema blueprint. `loop-connection-check` discovers available native tools and performs non-destructive checks. `loop-storage-setup` presents the exact mutations and stops for approval; after approval it instructs the agent to execute them through its native connection and verifies the resulting schema.

Deterministic TypeScript code validates manifests, generates canonical provider blueprints, hashes provisioning plans, verifies approval scope, and checks verification evidence. It never stores credentials and never calls provider APIs directly.

## Execution flow

1. Design the loop and choose storage.
2. Detect the agent’s native provider capability.
3. Run read-only connection and permission checks.
4. Generate a versioned, non-destructive provisioning plan.
5. Stop for explicit approval.
6. Execute through the agent’s native connection.
7. Verify tables, fields, indexes or headers, plus a reversible test write when approved.
8. Record the verified connection in the loop manifest.

Missing tools, authentication, schema permission, or verification evidence block activation. Existing incompatible fields produce a repair plan; Loopstack never changes types destructively by default.

## Testing

Tests cover the common schema, deterministic blueprints for all three providers, plan hashing and approval invalidation, capability discovery, blocked unverified connections, append-only/idempotency rules, and generated instructions for Hermes and Claude Code. No live provider account is required for the default suite.

## Consequence

The plugin remains a portable skill system rather than becoming an integration platform. A dedicated API adapter may be added later only when a native agent connection cannot satisfy a demonstrated requirement.
