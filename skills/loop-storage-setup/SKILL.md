---
name: loop-storage-setup
description: Use when a loop has a verified native storage connection and needs an approved, non-destructive operational-memory schema provisioned.
---

# Set Up Loop Storage

## Overview

Use in either of two explicit modes:

1. **Bootstrap mode** — the provider connection is authenticated but the approved project/container/deployment does not exist. Create only that empty boundary after exact hashed-plan approval, verify identity/read access, then return to `loop-connection-check`. Do **not** provision loop tables in the same approval.
2. **Schema mode** — the target connection is verified and needs the approved non-destructive operational-memory schema provisioned.

Translate the relevant blueprint into auditable instructions for the agent's native connection. Approval authorizes only the exact plan hash, provider, environment, resources, and expiry.

## Approval Boundary

Generate the provisioning plan and present every project/container/deployment or table/worksheet/field/index (according to mode), permission, verification step, and rollback action. Request explicit approval. Do not create any external resource while approval is absent, expired, or mismatched.

Bootstrap and schema approvals are separate. An approved storage design does not itself authorize cloud resource creation; an approved bootstrap does not authorize table/schema provisioning.

After approval:

1. Recompute and validate the plan hash.
2. Execute each non-destructive instruction through the named native connection.
3. Stop if a new mutation, destructive change, broader permission, or different environment is needed.
4. Collect redacted resource and schema evidence.
5. In **bootstrap mode**, verify the empty target identity/access, then return to `loop-connection-check`; do not create tables.
6. In **schema mode**, run `loopstack storage verify` and require `verified`.
7. Record the connection and schema version in `storage.yaml` as appropriate.

### Convex execution notes

For Convex schema mode:

1. Work in a loop-specific local directory and explicitly select the approved `team:project:deployment`; never rely on a deployment inherited from another project.
2. Install `convex` and `typescript`, and ensure `convex/tsconfig.json` exists before requiring typecheck.
3. Treat `npx convex codegen --init` as a **potential remote mutation**: despite its name, it may download state and upload functions/schema. Run it only after exact plan approval.
4. After deployment, list remote tables read-only, compare them to the plan resources, then run a second idempotent `convex dev --once --typecheck enable`.
5. Do not claim success from CLI exit alone; require Loopstack provisioning evidence verification with zero missing resources.

The agent must never claim setup succeeded merely because a tool returned success. Claim success only from complete verification evidence. Never copy credentials into artifacts or logs.

## Common pitfalls

- Assuming `codegen --init` is local-only on Convex; it can synchronize remote schema/functions.
- Running typecheck without a local TypeScript binary or `convex/tsconfig.json`.
- Selecting a deployment in the plugin repository instead of a loop-specific isolated directory.
- Verifying only table count while ignoring planned resource names and missing-resource checks.
- Leaving alert tests as recurring jobs or routing a direct-channel alert back into the origin thread.

## Handoff

Verified setup proceeds to `loop-eric-review`. Failed or incomplete verification stops with blockers and recovery instructions.

```yaml
handoff:
  loop_id: seo-growth
  completed_skill: loop-storage-setup
  status: completed
  artifacts: [provisioning-plan.json, provisioning-evidence.json, storage.yaml]
  next_skill: loop-eric-review
  blocking_requirements: []
```
