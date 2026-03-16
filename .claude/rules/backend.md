# Rule: packages/backend/**

Auto-loaded when editing files in `packages/backend/`.

- Import types from `packages/shared/types.ts` — never create local type duplicates
- All routes must extract `projectId` from query params or request body
- Use Drizzle ORM for all database queries — no raw SQL except in migrations
- Wrap all route handlers in try/catch, use errorHandler middleware
- Webhook routes (`/webhooks/*`) use raw body parser, not JSON
- Event processing: normalize → validate → identity resolve → enrich → persist → publish
- Never publish `historical_sync` events to BullMQ
- Log webhook payloads at debug level for troubleshooting
