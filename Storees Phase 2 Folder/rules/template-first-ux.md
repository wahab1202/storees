# Rule: Template-First UX

## Applies To
All creation flows in the frontend: flows/journeys, campaigns, push notifications, email templates, in-app messages, segments.

## The Rule
Every "Create New" action starts with a template gallery. The blank/from-scratch option exists but is NEVER the primary CTA. Users should feel guided, not intimidated.

## Pattern for Every Builder

### Entry Screen Layout
```
┌──────────────────────────────────────────────────────────┐
│  Create New [Flow / Campaign / In-App / Email / ...]     │
│                                                          │
│  ┌──────────────────────────────────────────────────┐    │
│  │  🔍 Search templates...                          │    │
│  └──────────────────────────────────────────────────┘    │
│  [ Filter by: Use Case ▼ ] [ Channel ▼ ] [ Vertical ▼ ] │
│                                                          │
│  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐       │
│  │ Template │ │ Template │ │ Template │ │ Template │      │
│  │ Card 1   │ │ Card 2   │ │ Card 3   │ │ Card 4   │     │
│  │          │ │          │ │          │ │          │      │
│  │ [Use]    │ │ [Use]    │ │ [Use]    │ │ [Use]    │     │
│  └─────────┘ └─────────┘ └─────────┘ └─────────┘       │
│                                                          │
│  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐       │
│  │ Template │ │ Template │ │ Template │ │ + Start  │      │
│  │ Card 5   │ │ Card 6   │ │ Card 7   │ │ from     │     │
│  │          │ │          │ │          │ │ scratch  │      │
│  │ [Use]    │ │ [Use]    │ │ [Use]    │ │          │     │
│  └─────────┘ └─────────┘ └─────────┘ └─────────┘       │
│                                                          │
│  Showing 8 templates  |  All (24)  Pre-built (18)        │
│  Saved (6)                                               │
└──────────────────────────────────────────────────────────┘
```

### Template Card Anatomy
```
┌─────────────────────────────┐
│ [icon]  Template Name       │
│                             │
│ Brief description of what   │
│ this template does and when │
│ to use it.                  │
│                             │
│ Tags: [welcome] [email]     │
│                             │
│ [Use Template] [Preview]    │
└─────────────────────────────┘
```

### "Start from scratch" Rules
- ALWAYS visible but NEVER the hero
- Placed as the LAST card in the grid (bottom-right)
- Styled differently from template cards (dashed border, muted)
- No description, no tags — just the option for power users who know what they want

### Counts on Tabs
Following MoEngage's pattern, ALWAYS show counts:
- "All (24)" — total templates
- "Pre-built (18)" — shipped with the Vertical Pack
- "Saved (6)" — tenant's custom saved templates
- "API (2)" — if API templates exist

### Filters
- By use case: Welcome, Onboarding, Abandonment, Win-back, Cross-sell, Reminder, Feedback, Promotional
- By channel: Email, Push, SMS, WhatsApp, In-App, Multi-channel
- By vertical: only show if tenant has access to multiple packs

## Specific Template Sets by Builder

### Flow Templates (loaded from Vertical Pack)
Ecommerce: Cart Abandonment, Browse Abandonment, Welcome Series, Post-Purchase, Win-Back, Replenishment, Price Drop, Review Request
NBFC: Application Recovery, EMI Reminder, KYC Completion, Cross-sell Post-Disbursement, Dormant Reactivation, NPA Prevention, Festive Campaign, Onboarding
SaaS: Trial-to-Paid, Onboarding Drip, Feature Adoption, Churn Prevention, Upgrade Prompt, Expansion, Win-Back, NPS Follow-up
EdTech: Enrollment Nudge, Lesson Reminder, Drop-off Prevention, Course Completion, Next Course, Referral, Payment Reminder

### Push/Email Templates
Visual layout templates (not content):
- Simple text
- Image + text
- Carousel
- Hero image banner
- CTA-focused
- Rich media

### In-App Templates
- Full screen modal
- Bottom sheet
- Top banner
- Nudge/tooltip
- Survey/feedback form
- Product recommendation card
- Announcement

## Why This Matters
MoEngage's demo showed that template-first is what makes the product feel approachable. Most marketing teams don't want to start from a blank canvas. They want a named use case, a pre-built skeleton, then light editing. The blank canvas is an escape hatch for power users, not the primary workflow.
