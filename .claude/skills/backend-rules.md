# Skill: Backend Rules

> Invoke with `/backend-rules`

## API Conventions
- All responses: `{ success: boolean, data: T, error?: string }`
- Pagination: `?page=1&pageSize=25`, response includes `pagination` object
- Errors: `{ success: false, error: "message", code: "ERROR_CODE", details?: {} }`
- Dates: ISO 8601 strings in API, Date objects internally
- Multi-tenant: every route handler must extract and validate `projectId`

## Express Setup
- JSON body parser for all routes EXCEPT webhooks
- Raw body parser for `/webhooks/*` routes (needed for HMAC verification)
- CORS: allow `FRONTEND_URL` origin
- Error handler middleware: catch all, log, return structured error

## Event Processing
- Normalize → Validate → Resolve Identity → Enrich → Persist → Publish
- Historical sync events (`platform = 'historical_sync'`) NEVER publish to BullMQ
- Deduplicate: hash `(project_id, event_name, customer_id, timestamp)` within 5s window
- Always persist to DB BEFORE publishing to queue

## BullMQ
- Queues: `events` (fan-out to segments + flows), `flow-actions` (delayed jobs), `shopify-sync`
- Workers: concurrency 10 for events, 5 for actions, 1 for sync
- Retry: 3 attempts, exponential backoff (1s, 5s, 30s)
