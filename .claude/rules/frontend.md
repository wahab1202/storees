# Rule: packages/frontend/**

Auto-loaded when editing files in `packages/frontend/`.

- Use shadcn/ui components as base — never build from scratch what shadcn provides
- All data fetching via TanStack Query hooks — never fetch in useEffect
- Import types from `packages/shared/types.ts`
- API calls go through `@/lib/api.ts` client (handles base URL + auth headers)
- Use `cn()` from `@/lib/utils` for all conditional Tailwind classes
- Never hardcode colors — use design system tokens
- Every page needs: loading skeleton, empty state, error boundary
- Components: PascalCase.tsx, co-located with tests
- Hooks: useCamelCase.ts in `/hooks/` directory
