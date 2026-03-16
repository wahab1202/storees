# Rule: packages/flows/**

Auto-loaded when editing files in `packages/flows/`.

- This is a service module — export functions, not routes
- Import types from `packages/shared/types.ts`
- BullMQ for all job scheduling — never use setTimeout/setInterval
- Exit events processed BEFORE trigger evaluation (order of operations)
- One customer = one active trip per flow (always check for duplicates)
- DEMO_DELAY_MINUTES env var overrides all delay values
- Resend API for email — template variables use {{double_braces}}
- Always store triggering event properties in trip.context for email personalization
- Cancel BullMQ jobs AND update DB scheduled_jobs status on exit
