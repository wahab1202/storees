# Rule: packages/shared/**

Auto-loaded when editing files in `packages/shared/`.

- This is the single source of truth for ALL types and constants
- Agent 1 (Backend) is the primary author — other agents read only
- Use `type` keyword (not `interface`) for all type definitions
- Use `as const` for constant objects to get literal types
- Never use `any` — use `unknown` or specific types
- All API response types must use ApiResponse<T> or PaginatedResponse<T> wrappers
- Changes here affect ALL packages — coordinate with all agents before modifying
- Export everything from index.ts for clean imports
