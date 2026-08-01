# Loopstack Design Specification

Date: 2026-08-01
Status: Proposed for final user review

## 1. Purpose

Loopstack is a versioned plugin of cooperating agent skills that helps a user discover, qualify, design, implement, test, deploy, operate, and improve AI Loops for recurring business processes.

Hermes Agent is the primary runtime. Claude Code is a supported runtime from the first release. The design must remain portable to other agents that support the `SKILL.md` convention.

Loopstack must behave as an opinionated consultant, not a form generator. It must challenge vague answers, recommend alternatives, refuse unsuitable AI Loop proposals, and prevent implementation until strict readiness criteria and an implementation plan have been approved.

## 2. Product principles

1. A loop is not merely a recurring prompt. It observes state, compares it to a target, selects and executes an action, measures the outcome, records evidence, and changes future decisions using the resulting learning.
2. An agent performs bounded executions. The loop coordinates repeated executions and compounds their results over time.
3. Improvement through feedback is mandatory. Autonomous self-modification is not.
4. Structural changes to a loop require impact analysis, a versioned plan, human approval, implementation, and QA.
5. A deterministic automation is preferable when AI judgment is unnecessary.
6. No deployment may occur without measurable objectives, bounded permissions, stop conditions, alerting, and tests.
7. Skills describe procedures; manifests define the loop; scripts perform fragile deterministic operations; the selected database stores operational state.
8. Every external mutation must be covered by an approved plan.

## 3. Alignment with Eric Siu's AI Loop model

Loopstack shall encode the following principles from Eric Siu's masterclass as explicit fields and validation rules:

- target state;
- observable current state;
- measurable gap;
- persistent state and evidence;
- scored decisions and bounded actions;
- human gates;
- QA before consequential action;
- follow-up measurement;
- learning, stopping, or escalating after an iteration;
- accumulated learnings that improve later decisions;
- required connectors and operating context;
- a leverage score from 1 to 100;
- iterative design improvement toward a high-quality loop;
- repository-backed skills and loop definitions;
- deferred measurement windows such as 7, 14, and 30 days when appropriate.

Loopstack shall provide a dedicated `loop-eric-review` gate. The review must not allow a high aggregate score to override a missing hard requirement.

## 4. Repository boundaries

Two separate repositories are required.

### 4.1 `loopstack`

Contains the plugin, reusable skills, schemas, templates, deterministic scripts, runtime adapters, test harness, and documentation needed to create and operate loops.

### 4.2 `business-loops`

Contains user-created business loop definitions, generated runtime packages, tests, fixtures, and the Git-backed registry.

Updating Loopstack must not directly rewrite business loops. Any required migration must create a versioned migration plan, request approval, and run regression tests.

## 5. Plugin architecture

The plugin is a collection of small, routed skills rather than one monolithic skill.

### 5.1 User-facing workflow skills

- `using-loopstack`: route requests, enforce lifecycle ordering, and load the appropriate skill.
- `loop-idea`: conduct an advisory interview inspired by Superpowers brainstorming and gstack Office Hours.
- `loop-qualify`: classify the process and determine whether it should be an AI Loop.
- `loop-design`: define the complete functional and technical design.
- `loop-eric-review`: validate the design against the reference AI Loop principles.
- `loop-plan`: produce a precise implementation plan and stop for approval.
- `loop-implement`: execute only the approved actions.
- `loop-qa`: execute the required QA gates and produce an activation verdict.
- `loop-deploy`: activate the loop progressively using shadow and canary modes.
- `loop-monitor`: inspect health, outcomes, costs, and open incidents.
- `loop-list`: list and filter all registered loops.
- `loop-show`: show configuration, versions, health, and recent runs for one loop.
- `loop-modify`: modify process steps, approvals, tools, storage, triggers, or policies through the same plan-and-approval workflow.
- `loop-debug`: investigate failed or degraded runs before proposing repairs.
- `loop-improve`: analyze accumulated evidence and propose controlled improvements.

### 5.2 Internal capability modules

- Hermes runtime adapter;
- Claude Code runtime adapter;
- Convex storage adapter;
- Airtable storage adapter;
- Google Sheets storage adapter;
- alert delivery adapter;
- manifest generator and validator;
- skill generator and validator;
- connection verifier;
- scenario and contract test runner.

Internal modules may be implemented as support skills, references, or scripts depending on the required degree of determinism. Credential management, schema creation, migrations, and idempotency checks must use deterministic scripts or provider tools rather than improvised prompts.

## 6. `loop-idea` interview behavior

`loop-idea` asks one question at a time and adapts subsequent questions to the evidence already collected. It must advise, object, and recommend instead of merely recording answers.

It should establish at least:

- the recurring business pain;
- the actual person or role experiencing it;
- evidence that the process is costly or important;
- the current workaround;
- frequency and volume;
- current cost, time, or failure rate;
- desired measurable outcome;
- smallest valuable version;
- places where AI judgment may be needed;
- places where deterministic automation is sufficient;
- available feedback signals;
- consequential or irreversible actions;
- candidate human checkpoints.

The skill may finish with one of three outcomes:

1. enough evidence to continue to `loop-qualify`;
2. a blocked discovery state with the missing evidence listed;
3. a recommendation to abandon or reframe the idea.

## 7. Qualification and strict readiness

`loop-qualify` must classify the proposal as one of:

- AI Loop;
- AI-assisted workflow;
- deterministic automation;
- on-demand agent task;
- monitoring or reporting system;
- human SOP or approval process;
- data pipeline;
- one-time project;
- multiple independent loops requiring decomposition.

An AI Loop is inadmissible unless all hard requirements are satisfied:

1. recurring or event-driven opportunity;
2. measurable target state;
3. observable current state;
4. calculable or assessable gap;
5. bounded action space;
6. at least one feedback signal;
7. defined measurement horizon;
8. sufficient data access;
9. named owner;
10. approval policy;
11. budget and iteration limits;
12. stop and escalation conditions;
13. idempotency strategy;
14. selected and connected storage;
15. required tool connections;
16. tested alert channel;
17. success criteria for an individual run;
18. success criteria for the business objective.

The skill may produce a draft design while blocked, but it must not generate deployable triggers, grant write permissions, or activate a loop.

## 8. Generated loop package

Each business loop is stored as a declarative, versioned package:

```text
loops/<loop-id>/
├── loop.yaml
├── process.yaml
├── skills.yaml
├── tools.yaml
├── storage.yaml
├── approvals.yaml
├── alerts.yaml
├── evaluations.yaml
├── tests.yaml
├── SKILL.md
├── references/
├── scripts/
├── fixtures/
└── versions/
```

The declarative files are the source of truth. `SKILL.md` contains the Hermes/Claude procedural behavior. Deterministic scripts handle fragile or repeatable operations. Generated artifacts must declare their source manifest version to detect drift.

A loop may invoke multiple skills. `skills.yaml` distinguishes:

- orchestrator skill;
- required skills;
- optional skills;
- allowed skills;
- forbidden skills;
- missing skills to install or create.

## 9. Skill handoff contract

Every workflow skill must finish with a machine-readable handoff:

```yaml
handoff:
  loop_id: seo-growth
  completed_skill: loop-design
  status: completed
  artifacts: []
  next_skill: loop-eric-review
  blocking_requirements: []
```

The next skill runs automatically when:

- the current skill completed successfully;
- no human decision is required;
- no blocking requirement remains;
- the lifecycle transition is valid.

The workflow stops and presents the exact continuation command when approval or missing information is required. The router must reject invalid transitions such as deploying before QA.

## 10. Lifecycle and registry

Normalized lifecycle states are:

- `idea`;
- `qualifying`;
- `blocked`;
- `designing`;
- `planned`;
- `awaiting-approval`;
- `building`;
- `qa-failed`;
- `ready`;
- `shadow`;
- `canary`;
- `active`;
- `paused`;
- `degraded`;
- `failed`;
- `inactive`;
- `archived`.

`loop-list` combines the Git registry with runtime records and displays at minimum:

- loop identifier and name;
- lifecycle state;
- runtime and profile;
- storage provider;
- active version;
- last run and outcome;
- current health;
- pending approvals;
- open alerts;
- current target and latest gap.

Supported administration includes listing, inspecting, pausing, resuming, and archiving. Consequential changes still require an approved plan.

## 11. Storage abstraction

The user chooses Convex, Airtable, or Google Sheets for each loop.

All adapters implement the same logical operations:

- register or version a loop;
- create and close a run;
- record events and observations;
- record decisions and referenced evidence;
- record actions and action results;
- request and resolve approvals;
- record evaluations;
- record alerts and incidents;
- record learnings;
- record heartbeats and costs.

The common logical entities are:

- loops;
- loop versions;
- runs;
- events;
- observations;
- decisions;
- actions;
- action results;
- evaluations;
- approvals;
- alerts;
- learnings;
- tool connections.

Connection checks should be non-destructive where possible. Schema creation, test writes, migrations, and cleanup require coverage in the approved implementation plan.

Convex is the recommended production backend because it can support durable workflows, scheduling, retries, and a future control plane. Airtable is recommended for non-technical teams. Google Sheets is recommended for low-risk prototypes.

## 12. Runtime portability

Hermes Agent is the primary runtime and must support:

- skills and supporting references;
- cron, webhook, API, and human triggers;
- gateway delivery channels;
- profile-specific configuration;
- skill modification proposals with write approval;
- execution history and runtime health checks.

Claude Code support must provide equivalent workflow skills, connection checks, plan approval, file generation, QA, and monitoring commands within the capabilities of that runtime.

Canonical skill logic remains host-neutral. Runtime adapters map tool names, configuration locations, permissions, triggers, and delivery behavior. The build must generate host-specific wrappers whenever direct portability would make a skill ambiguous or unsafe.

## 13. Plan and approval contract

Before any external mutation, `loop-plan` produces a versioned plan containing:

- process classification and rationale;
- target, current state, gap, and metrics;
- architecture and selected runtime;
- exact artifacts to create or change;
- database schema and migrations;
- connections and permissions;
- triggers and schedules;
- human approval policy;
- alerting and escalation policy;
- QA scenarios and activation gates;
- rollout and rollback strategy;
- cost estimate and limits;
- exact permitted external actions;
- explicit out-of-scope actions.

Approval authorizes only the listed actions and environment. If implementation requires an unlisted action or a material plan change, execution stops, produces a new plan version, and requests a new approval.

Runtime approvals defined inside the business process remain in force after the implementation plan is approved.

## 14. QA and activation gates

QA is mandatory after initial implementation and every material modification.

The required pipeline is:

1. static manifest and schema validation;
2. skill availability and drift validation;
3. credential and connection validation;
4. storage adapter contract tests;
5. deterministic unit tests;
6. scenario tests using fixtures and model stubs;
7. selected live-model evaluation tests;
8. approval enforcement tests;
9. duplicate delivery and idempotency tests;
10. timeout, retry, and partial failure tests;
11. alert delivery test;
12. shadow runs;
13. limited canary run;
14. activation verdict.

AI output tests assert schemas and invariants rather than exact wording. Live-model tests use threshold-based evaluations and repeated runs where variance matters.

Mandatory scenarios include:

- nominal success;
- missing or contradictory data;
- low-confidence decision;
- rejected and expired approval;
- duplicate webhook;
- unavailable tool;
- timeout after a possible side effect;
- exhausted retries;
- budget limit reached;
- agent process interruption;
- alert channel failure;
- successful resume without duplicate action.

Any failed blocking test prevents activation. `loop-qa` produces a human-readable and machine-readable report.

## 15. Deployment modes

Every loop progresses through:

1. `shadow`: observe and decide without external effects;
2. `draft`: execute only reversible or sandboxed effects;
3. `approval`: prepare real effects and require human confirmation;
4. `canary`: execute on a restricted scope;
5. `active`: execute within approved autonomy boundaries.

New loops may not start directly in `active` mode.

## 16. Alerts and recovery

Every ready loop must have a tested alert destination. Supported conditions include:

- failed, unknown, or interrupted execution;
- missing heartbeat;
- no progress beyond the configured threshold;
- retries exhausted;
- inaccessible or expired connection;
- partial result;
- failed quality gate;
- expired approval;
- cost or iteration budget exceeded;
- suspected duplicate action;
- expected outcome not observed;
- failed alert delivery.

Alerts include loop and run identifiers, failed step, completed actions, duplicate risk, retry history, recommended intervention, and the exact resume procedure.

Recovery must use idempotency keys and persisted checkpoints. Every deployable loop must have a watchdog outside its primary agent execution. Convex may host that watchdog directly; Airtable and Google Sheets deployments use a separately scheduled Hermes or Claude Code health check.

## 17. Improvement and modification

Each iteration records what was observed, decided, executed, measured, and learned. Improvement can occur at three levels:

1. decisions improve from accumulated evidence;
2. bounded parameters may adapt automatically within approved ranges;
3. structural changes require a new plan and approval.

`loop-modify` supports changes to process steps, approval rules, triggers, tools, storage, alerting, and evaluation thresholds. It must show a semantic diff, identify impacted tests and data migrations, produce a plan, obtain approval, implement a new version, rerun QA, and deploy progressively.

Running executions remain pinned to their starting version. New executions use the newly activated version.

## 18. Future platform compatibility

The MVP does not include a web interface. It must expose contracts that allow a later platform to visualize loops across Hermes, Claude Code, and other agents.

Required future-facing fields include:

- stable loop, run, step, decision, action, and approval identifiers;
- normalized runtime and lifecycle status;
- timestamped append-only events;
- agent runtime and profile identifiers;
- heartbeats;
- cost and token metadata where available;
- target, current state, and gap snapshots;
- references from decisions to evidence;
- version and deployment-mode metadata.

The future platform will be a control-plane view over these contracts, not the source of truth for loop procedures.

## 19. Security and safety

- Apply least privilege to every connector.
- Store secrets only in runtime/provider secret stores, never in Git or generated manifests.
- Treat webhook payloads and external page content as untrusted.
- Require authenticated and replay-protected webhooks where supported.
- Separate test and production resources.
- Require explicit approval for destructive or externally consequential operations.
- Record audit events for approvals, permission changes, deployments, and structural modifications.
- Provide a pause and kill switch for every active loop.

## 20. MVP scope

The first implementation includes:

- the `loopstack` plugin repository;
- the `business-loops` repository template;
- all core workflow skills listed in section 5.1;
- Hermes and Claude Code adapters;
- fully implemented Convex, Airtable, and Google Sheets storage adapters;
- safe connection verification and schema provisioning plans for all three storage choices;
- the common manifest schemas;
- handoff and lifecycle enforcement;
- QA harness and representative failure scenarios;
- loop registry and `loop-list`/`loop-show` capabilities;
- alert contract and at least one Hermes delivery channel;
- a non-production SEO loop fixture used for end-to-end validation.

The MVP excludes:

- a web platform;
- automatic migration of existing business processes;
- full production integrations for every possible business tool;
- autonomous structural self-modification;
- immediate activation of a generated loop without shadow and QA stages.

## 21. Acceptance criteria

The MVP is accepted when:

1. Hermes can invoke `loop-idea` and complete a routed workflow through qualification and planning.
2. Claude Code can execute the same logical workflow with runtime-appropriate instructions.
3. An unsuitable process is correctly rejected or redirected to another solution.
4. Missing hard requirements block deployable loop generation.
5. A valid proposal produces a versioned loop package and implementation plan.
6. No external mutation occurs before plan approval.
7. Any plan deviation requires a new approval.
8. The generated loop can reference multiple skills.
9. The selected storage connection is verified and its schema plan is generated.
10. QA detects duplicate-action, approval-bypass, timeout, and connection-failure defects.
11. Failed blocking QA prevents activation and produces an alert-ready report.
12. A loop modification produces a semantic diff, new version, updated tests, and a fresh QA verdict.
13. `loop-list` displays loops in build, blocked, active, inactive or paused, degraded or failed, and archived states.
14. The SEO fixture completes a shadow execution and records observations, decision, simulated action result, evaluation, and learning.

## 22. Resolved design decisions

- Use a plugin of routed specialist skills, not one monolithic skill.
- Use Hermes as the primary runtime and support Claude Code from the first release.
- Keep business loops in a separate repository.
- Use declarative loop files as the source of truth.
- Allow a loop to invoke multiple skills.
- Require strict readiness gates before generation or deployment.
- Generate an implementation plan and wait for approval before mutation.
- Require new approval for material plan deviations.
- Require QA, shadow, and canary stages.
- Make improvement mandatory but structural self-modification controlled.
- Include loop listing and operational lifecycle management.
- Prepare data contracts for a future platform but do not build the platform in the MVP.
