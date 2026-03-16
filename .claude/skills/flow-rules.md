# Skill: Flow Rules

> Invoke with `/flow-rules`

## Trigger Evaluation
- Only evaluate against flows with `status = 'active'`
- Match: event_name matches trigger_config.event
- Then check: trigger filters match event properties
- Then check: audience filters match customer profile
- Exit events checked BEFORE trigger evaluation (order of operations matters)

## Trip Rules
- One customer = one active/waiting trip per flow (duplicate prevention)
- Frequency cap: skip if customer completed/exited same flow in last 24 hours
- Trip context stores triggering event properties (cart items, product info)
- State machine: active → waiting (at delay) → active (delay fires) → completed/exited

## Node Execution
- Trigger: entry marker, advance immediately to next node
- Delay: schedule BullMQ delayed job, set trip to 'waiting'
- Condition: query events or customer attributes, branch yes/no
- Action: send email via Resend, substitute {{variables}} from context + customer
- End: set trip completed, cancel remaining jobs

## Demo Mode
- `DEMO_DELAY_MINUTES` env var overrides ALL delay values
- Set to 2 for demos, 30 for production
- Pre-trigger a backup email before any demo

## Exit Conditions
- When exit event fires: find all active/waiting trips for this customer+flow
- Cancel all pending scheduled_jobs (both DB status and BullMQ job)
- Set trip status = 'exited', exited_at = now()
