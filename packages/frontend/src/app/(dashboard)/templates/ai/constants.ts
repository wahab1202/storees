// sessionStorage hand-off key: the AI Email Designer stashes the generated
// template here, and /templates/create?from=ai reads + clears it.
// Kept out of page.tsx because Next.js App Router pages may only export the
// default component and reserved names — any other export fails `next build`.
export const AI_TEMPLATE_STASH = 'storees:ai-template'
