---
name: loop-storage-setup
description: Use when a loop has a verified native storage connection and needs an approved, non-destructive operational-memory schema provisioned.
---

# Set Up Loop Storage

## Overview

Translate the blueprint into auditable instructions for the agent's native connection. Approval authorizes only the exact plan hash, provider, environment, resources, and expiry.

## Approval Boundary

Generate the provisioning plan and present every table, worksheet, field, index, permission, verification step, and rollback action. Request explicit approval. Do not create tables, worksheets, fields, indexes, test rows, or external resources while approval is absent, expired, or mismatched.

After approval:

1. Recompute and validate the plan hash.
2. Execute each non-destructive instruction through the named native connection.
3. Stop if a new mutation, destructive change, broader permission, or different environment is needed.
4. Collect redacted resource and schema evidence.
5. Run `loopstack storage verify` and require `verified`.
6. Record the connection and schema version in `storage.yaml`.

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
