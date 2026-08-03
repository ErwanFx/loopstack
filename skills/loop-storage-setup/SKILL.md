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

The agent must never claim setup succeeded merely because a tool returned success. Claim success only from complete verification evidence. Never copy credentials into artifacts or logs.

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
