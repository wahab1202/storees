# Skill: UI Rules

> Invoke with `/ui-rules`

## Design Tokens
- Sidebar: `#0D1138` bg, `#4F46E5` active, 240px fixed
- Headings: `#0D1138`, body: `#1A1A2E`, secondary: `#6B7280`, accent: `#4F46E5`
- Surface: `#F5F6FF` (page bg), `#FFFFFF` (cards, elevated)
- Never hardcode Tailwind colors — use semantic tokens

## Component Rules
- Use shadcn/ui as base layer (Button, Table, Card, Badge, Dialog, Tabs, Popover, Sonner)
- Lucide React for all icons
- `cn()` from `@/lib/utils` for conditional classes
- TanStack Query v5 for all data fetching — never fetch in useEffect
- recharts for all charts (AreaChart, BarChart, LineChart)

## Page Structure
- Every page: `<PageHeader>` with title + optional actions, then content
- Tables: shadcn Table with sortable headers, hover rows, pagination bottom-right
- Empty states: icon + title + description + CTA button
- Loading: skeleton components matching the layout shape

## Dashboard Pattern (MoEngage-style)
- **Metric strip**: horizontal inline band, no card borders. Each metric shows label + value + % change inline
- **Chart grid**: 3 charts per row in white rounded cards. Each chart has title + sub-stat box ("Last Day / Average")
- **Date range**: picker in header bar with Apply button
- **Sections**: metric strip → chart rows → activity feed (scrollable page)

## File Conventions
- Components: `PascalCase.tsx`
- Hooks: `useCamelCase.ts`
- Pages: `page.tsx` (Next.js App Router convention)
- Co-locate: `Component.tsx` + `Component.test.tsx` in same directory
