# Agent: Flow Engine

> **ID**: Agent 4
> **Color**: Purple
> **Directory**: `packages/flows/`
> **Consumed by**: Agent 1 (imports service), BullMQ events queue (subscribes)

## Responsibilities

1. **Trigger Evaluation**: Match incoming events against active flow triggers
2. **Trip Management**: Create trips, advance through nodes, handle state transitions
3. **Delay Scheduling**: BullMQ delayed jobs for time-based nodes
4. **Action Execution**: Send emails via Resend, log actions
5. **Exit Conditions**: Cancel trips when exit events fire
6. **Flow Templates**: Abandoned cart, post-purchase review

## Key Documentation

- `docs/domains/flows/ENGINE.md` — Trigger evaluation, trip state machine, node execution, exit handling
- `docs/domains/flows/TEMPLATES.md` — Abandoned cart + post-purchase flow definitions
- `docs/domains/integrations/EMAIL.md` — Resend API, template variables, HTML template
- `docs/domains/data-layer/JSON_SCHEMAS.md` — TriggerConfig, FlowNode schemas

## Directory Structure

```
packages/flows/
├── src/
│   ├── index.ts              ← Exported service interface
│   ├── trigger.ts            ← evaluateTrigger() — match event against flows
│   ├── executor.ts           ← executeNode() — run trigger/delay/condition/action/end
│   ├── scheduler.ts          ← Schedule + cancel BullMQ delayed jobs
│   ├── trip.ts               ← Trip CRUD, state transitions, duplicate prevention
│   ├── actions/
│   │   └── sendEmail.ts      ← Resend integration, template variable substitution
│   ├── templates.ts          ← Flow template definitions + email template creation
│   └── types.ts              ← Re-export from shared
├── package.json
└── tsconfig.json
```

## Prompt for Claude Code

```
You are building the flow/journey engine for Storees as a service module.

Tech: TypeScript + BullMQ (job scheduling) + Resend (email sending).

Your directory: packages/flows/

Read these docs:
- docs/domains/flows/ENGINE.md (trigger evaluation, trip state machine, exit conditions)
- docs/domains/flows/TEMPLATES.md (abandoned cart + post-purchase templates)
- docs/domains/integrations/EMAIL.md (Resend API, template variables)

Export these functions:
1. evaluateTrigger(event: TrackedEvent, projectId: string): FlowTrip[]
2. executeNode(trip: FlowTrip, node: FlowNode): void
3. handleDelayComplete(jobId: string): void
4. handleExitEvent(event: TrackedEvent): void
5. getFlowTemplates(): FlowTemplate[]

BullMQ queues:
- 'events' queue: you consume. Published by Agent 1.
- 'flow-actions' queue: you publish delayed jobs.

CRITICAL for demo:
- DEMO_DELAY_MINUTES env var overrides ALL delay node values
- Exit event checking happens BEFORE trigger evaluation
- Abandoned cart email MUST include customer name, cart items with images, checkout URL
- Duplicate trip prevention: one customer = one active trip per flow

Import types from packages/shared/types.ts.
Resend API key from RESEND_API_KEY env var.
```
