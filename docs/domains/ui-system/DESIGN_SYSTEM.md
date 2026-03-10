# UI System — Design System

> **Reference**: Omnisend / Klaviyo admin panel aesthetic
> **Framework**: Tailwind CSS + shadcn/ui
> **Icons**: Lucide React

## Color Tokens

Use these as Tailwind CSS custom colors. NEVER use raw Tailwind color classes (`bg-blue-500`). Always use semantic tokens.

| Token | Hex | Usage |
|-------|-----|-------|
| `--sidebar-bg` | `#0F1D40` | Sidebar background |
| `--sidebar-text` | `#FFFFFF` | Sidebar text |
| `--sidebar-text-muted` | `#94A3B8` | Sidebar secondary text |
| `--sidebar-active` | `#D9A441` | Sidebar active indicator + icon highlight |
| `--sidebar-hover` | `#1A2A52` | Sidebar item hover state |
| `--content-bg` | `#FFFFFF` | Main content area background |
| `--surface` | `#F9FAFB` | Cards, table rows (alternating), input backgrounds |
| `--surface-elevated` | `#FFFFFF` | Elevated cards, modals, dropdowns |
| `--border` | `#E5E7EB` | Borders, dividers, table lines |
| `--border-focus` | `#D9A441` | Focus rings, active borders |
| `--text-primary` | `#212121` | Primary body text |
| `--text-secondary` | `#6B7280` | Secondary text, labels, descriptions |
| `--text-muted` | `#9CA3AF` | Placeholder text, disabled text |
| `--heading` | `#0F1D40` | All headings |
| `--accent` | `#D9A441` | CTAs, primary buttons, active states, key numbers |
| `--accent-hover` | `#C4922E` | CTA hover state |
| `--success` | `#10B981` | Success badges, positive metrics |
| `--warning` | `#F59E0B` | Warning badges, attention states |
| `--error` | `#EF4444` | Error badges, destructive actions |
| `--info` | `#3B82F6` | Info badges, links |

### Tailwind Config Extension

```javascript
// tailwind.config.ts
theme: {
  extend: {
    colors: {
      sidebar: { DEFAULT: '#0F1D40', hover: '#1A2A52', active: '#D9A441' },
      accent: { DEFAULT: '#D9A441', hover: '#C4922E' },
      heading: '#0F1D40',
      surface: { DEFAULT: '#F9FAFB', elevated: '#FFFFFF' },
    }
  }
}
```

## Typography

| Element | Font | Size | Weight | Color |
|---------|------|------|--------|-------|
| Page Title | Inter / system | 24px (`text-2xl`) | Bold | `--heading` |
| Section Heading | Inter / system | 18px (`text-lg`) | Semibold | `--heading` |
| Card Title | Inter / system | 16px (`text-base`) | Semibold | `--heading` |
| Body | Inter / system | 14px (`text-sm`) | Normal | `--text-primary` |
| Small / Label | Inter / system | 12px (`text-xs`) | Medium | `--text-secondary` |
| Badge | Inter / system | 11px | Medium | Varies |

## Spacing System

Follow Tailwind's 4px base grid. Common patterns:

| Context | Spacing |
|---------|---------|
| Page padding | `p-6` (24px) |
| Card padding | `p-5` (20px) |
| Section gap | `space-y-6` (24px) |
| Card gap | `gap-4` (16px) |
| Table cell padding | `px-4 py-3` |
| Button padding | `px-4 py-2` |
| Form field gap | `space-y-4` |
| Badge padding | `px-2 py-0.5` |

## Layout Structure

```
┌──────────────────────────────────────────────────┐
│  Sidebar (240px fixed)  │  Content Area           │
│                         │                         │
│  Logo/Brand             │  Page Header            │
│  ─────────              │  ───────────────────    │
│  Dashboard              │                         │
│  Customers              │  Content Body           │
│  Segments               │                         │
│  Flows                  │                         │
│  Event Debugger         │                         │
│                         │                         │
│  ─────────              │                         │
│  Settings               │                         │
│  Connected Stores       │                         │
└──────────────────────────────────────────────────┘
```

- Sidebar: **240px** fixed width, always visible, dark background (`--sidebar-bg`)
- Content area: fluid, min-width 800px
- Max content width: **1280px** centered within content area
- Content area has a thin top border or subtle header bar for breadcrumbs

## Sidebar Component Spec

```
┌─────────────────────┐
│  ◆ STOREES          │  ← Logo/brand, 16px text, white, tracking-wider
│                     │
│  ■ Dashboard        │  ← Icon (16px) + text (14px), py-2.5 px-4
│  ■ Customers        │     Hover: bg-sidebar-hover
│  ■ Segments         │     Active: left border accent, text-white, bg-sidebar-hover
│  ■ Flows            │     Inactive: text-sidebar-text-muted
│  ■ Event Debugger   │
│                     │
│  ─────────────────  │  ← Divider: border-t border-white/10
│                     │
│  ⚙ Settings         │
│  🔗 Connected Stores│
└─────────────────────┘
```

**Sidebar Icons (Lucide React):**
- Dashboard: `LayoutDashboard`
- Customers: `Users`
- Segments: `PieChart`
- Flows: `Workflow`
- Event Debugger: `Radio`
- Settings: `Settings`
- Connected Stores: `Store`

## Component Patterns

### Metric Card

```
┌──────────────────────┐
│  Total Customers      │  ← Label: text-xs text-secondary uppercase tracking-wide
│  12,847               │  ← Value: text-3xl font-bold text-heading
│  ↑ 12% from last mo  │  ← Trend: text-xs text-success (or text-error for negative)
└──────────────────────┘
```

### Data Table

- Use shadcn `<Table>` component
- Header row: `bg-surface`, `text-xs uppercase tracking-wide text-secondary`, `font-medium`
- Data rows: `hover:bg-surface`, border-bottom `border`
- Sortable columns: header text + sort icon (ChevronUp/Down)
- Pagination: bottom-right, showing "Page X of Y" with prev/next buttons

### Badge / Tag

| Variant | Background | Text | Usage |
|---------|-----------|------|-------|
| Default | `bg-surface` | `text-secondary` | Neutral tags |
| Success | `bg-emerald-50` | `text-emerald-700` | Subscribed, Active, Fulfilled |
| Warning | `bg-amber-50` | `text-amber-700` | Pending, Needs Attention |
| Error | `bg-red-50` | `text-red-700` | Non-subscribed, Cancelled, At Risk |
| Info | `bg-blue-50` | `text-blue-700` | Segment badges, flow status |
| Accent | `bg-accent/10` | `text-accent` | Champion, Premium features |

### Button Variants

| Variant | Style | Usage |
|---------|-------|-------|
| Primary | `bg-accent text-white hover:bg-accent-hover` | Main CTAs (Create, Save, Start) |
| Secondary | `border border-border bg-white text-heading hover:bg-surface` | Secondary actions |
| Ghost | `text-secondary hover:text-heading hover:bg-surface` | Tertiary actions, icon buttons |
| Destructive | `bg-red-600 text-white hover:bg-red-700` | Delete, Remove |

### Empty State

```
┌──────────────────────────────┐
│                              │
│       [Illustration/Icon]    │
│                              │
│     No customers yet         │  ← text-lg font-semibold text-heading
│                              │
│  Connect your Shopify store  │  ← text-sm text-secondary
│  to start seeing customer    │
│  data here.                  │
│                              │
│     [ Connect Shopify ]      │  ← Primary button
│                              │
└──────────────────────────────┘
```

## Responsive Behavior

- **Desktop (>1280px)**: Full layout as designed
- **Tablet (768-1280px)**: Sidebar stays, content area narrows. Tables become horizontally scrollable.
- **Mobile (<768px)**: Out of scope for sprint. Admin panels are desktop-first.

## Loading States

- **Page load**: Full-page skeleton with shadcn `<Skeleton>` components matching layout
- **Table load**: Skeleton rows (5 rows of skeleton cells)
- **Button loading**: Replace text with spinner, disable click
- **Data refresh**: Subtle top-bar progress indicator (thin accent-colored line)

## Toast / Notification Patterns

- Use shadcn `<Sonner>` for toast notifications
- Position: bottom-right
- Auto-dismiss: 5 seconds
- Types: success (green left border), error (red left border), info (blue left border)
