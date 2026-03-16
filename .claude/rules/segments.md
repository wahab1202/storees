# Rule: packages/segments/**

Auto-loaded when editing files in `packages/segments/`.

- This is a service module, not a standalone app — export functions, not routes
- Import types from `packages/shared/types.ts`
- SQL-first filter evaluation: translate FilterConfig to WHERE clauses
- Use Drizzle query builder from the shared DB connection
- Cache segment member counts — update only when re-evaluation runs
- Default segments cannot be deleted, only deactivated
- Emit `enters_segment` / `exits_segment` events when membership changes
