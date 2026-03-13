# MoEngage Platform Analysis — From Demo Video

> Extracted from `~/Movies/moengage demo.mov` — MoEngage interactive product tour (moengage.navattic.com)

---

## 1. Platform Architecture (Left Sidebar Navigation)

MoEngage organizes everything into **7 top-level modules** via an icon sidebar:

| Icon | Module | What It Does |
|------|--------|-------------|
| + | **Create New** | Campaign, Flow, Experience, Alerts, Dashboard, Segment |
| Grid | **Dashboard** | Key Metrics — DAU, MAU, Conversions, Revenue, Stickiness |
| Chart | **Analytics (Behavior)** | Event-based analysis with filters, segments, split-by |
| Phone | **Engage (Campaigns)** | Multi-channel campaigns with performance metrics |
| Megaphone | **Inform (Alerts)** | Transactional alerts — unified API across channels |
| User | **User Profiles** | 360-degree customer view |
| Shield | **Personalize** | On-site/in-app content personalization |
| Target | **Segment** | Filter-based user segments |
| Blocks | **Content** | Reusable content blocks across campaigns |
| Sparkle | **Proactive Assistant** | AI-powered insights (RFM, conversion rate analysis) |
| Code | **Developer** | SDK integration, APIs |
| Gear | **Settings** | Account, teams, permissions |

### Storees Gap
Storees has: Dashboard, Customers, Segments, Campaigns, Templates, Flows, Event Debugger.
**Missing**: Analytics/Behavior module, Personalize (on-site), Content Blocks, Proactive AI Assistant, Alerts (transactional), Developer portal.

---

## 2. Dashboard — Key Metrics (Frame 20-25)

MoEngage dashboard shows **real-time KPI cards** with trend indicators:

- **Average DAU**: 4.6K (1% change)
- **Average MAU**: 130.4K (0% change)
- **New Users**: 35.4K (2% change)
- **Uninstalled Users**: 11.1K (6% change)
- **New Web Push Subs**: 0.0 (0%)
- **Agg Web Push Subs**: 20.0 (0%)
- **Conversions**: 12.5K (8% change)
- **Revenue**: $2.15M (34% change)

Below the cards, **time-series line charts** for:
- Daily Active Users vs 30 Day Active Users (dual-axis)
- New Users vs Uninstalled Users
- Conversions and Revenue
- Order Value (Last Day vs Average)
- **Stickiness** metric: DAU/MAU ratio (3.46%)

Each metric card shows: **Total**, **Average**, **Last Day**, with **% change arrows**.

### Storees Gap
Our dashboard has 5 static cards (Total Customers, Active 7D, Transactions, Volume, Avg CLV) + a plain activity feed. **Missing**:
- Trend indicators (% change, up/down arrows)
- Time-series charts (line graphs over date ranges)
- Date range picker (MoEngage has "01 Jan 2024 - 08 Jan 2024" with Apply)
- Platform filter (All, Android, iOS, Web)
- Stickiness / retention metrics
- Revenue tracking
- New vs churned user tracking

---

## 3. Create New Menu (Frame 5, 15, 25)

MoEngage's "Create New" is organized into categories:

### Engage
- **Campaign** → Outbound: Push, Email, SMS | Inbound: In-app, On-site, Cards
- **Flow** → Multi-channel orchestration

### Personalize
- **Experience** (Beta) → Personalize app/web experience

### Inform
- **Alerts** → Unified transactional messaging infrastructure

### Analyze
- **Dashboard** → Custom pinned metric dashboards

### Segment
- **Segment** → Group users by actions and properties

### Audience
- **Facebook**, **Google Ads** → Audience sync to ad platforms

### Connectors
- **Custom** → Custom data connectors

### Storees Gap
We have campaigns and flows. **Missing**:
- In-app messaging, On-site overlays, Cards
- Audience sync to Facebook/Google Ads
- Custom connectors/integrations
- Personalization engine (web experience)
- Transactional alerts as separate concept

---

## 4. Campaign Types & Channels (Frame 45, 100-125)

### Outbound Channels
- **Push** (Android, iOS, Web) — with A/B testing, Locale variants
- **Email** — One Time or Periodic, with visual template gallery
- **SMS**

### Campaign Subtypes
- **One Time** — send once
- **Periodic** — recurring schedule
- **Business Event Triggered** (NEW) — triggered by backend events

### Campaign Creation Wizard (3 Steps)
1. **Target Users** — Team, Campaign Name, Tags, Target Audience (All users / Filter by: User Property, User Behavior, User Affinity, Custom Segment)
2. **Content** — Merlin AI for copywriting, message title/body, notification channel, live device preview (Android 12+ / Android 11-), Dark/Light mode, Collapse/Expand, size variants
3. **Schedule and Goals** — Date picker, time zone, "Best time for user (Sherpa)" option, conversion goals, pre-compute audience

### Key Features
- **Merlin AI** — AGI-powered content generation for push notifications
- **Sherpa** — "Best time for user" — per-user optimal send time
- **Campaign Performance** — Impressions, Clicks, Conversions with progress bars
- **Campaign Tags** — activation, engagement, promotional, transactional, upsell
- **Reachability** — 239.8K push reachable (13.78% of 1.74M total), broken down by Android/iOS/Web
- **Preference Management** — opt-out respect per subscription category

### Storees Gap
We have basic email campaigns. **Missing**:
- Push notifications (mobile + web)
- SMS campaigns
- AI content generation (Merlin AI equivalent)
- Per-user optimal send time (Sherpa equivalent)
- Campaign A/B testing
- Reachability analysis before sending
- Campaign tags/categorization
- Preference/subscription category management
- Campaign performance dashboards (impressions, clicks, conversions)
- Periodic/recurring campaigns
- Business event triggered campaigns

---

## 5. Analytics — Behavior Analysis (Frame 40)

Dedicated analytics module with:
- **Events & Filters** — Select events, add attributes, OR conditions
- **Filter Users** — By segment, with segment comparison
- **Behavior Options** — Analysis type, Compare by, Duration
- **Split by** — Break down by any attribute

### Storees Gap
We have no analytics/behavior module. **Missing**:
- Event funnel analysis
- Behavior trends over time
- Segment comparison
- Event attribute drill-down

---

## 6. Segment Management (Frame 42)

Segment list shows:
- Segment name (clickable)
- Type: Filter
- Created at / Updated at timestamps
- Named segments: "Abandoned cart", "about to sleep", "Price Sensitive users of RFM", "1000+ Product Viewed", "Amze champions"
- Action menu (3-dot)

### Storees Gap
Our segments page is solid (lifecycle chart, templates, AI builder). MoEngage's segment list is simpler (just a table). We're actually ahead here with the visual lifecycle grid and AI segment builder.

---

## 7. Inform — Transactional Alerts (Frame 50)

Dedicated transactional messaging section:
- Alert templates: Login OTP, Order Confirmation, etc.
- Channels: SMS, Email, Push (per alert)
- Status: Active / Paused
- Tags: transactional, activation, engagement
- Requests received / processed metrics

### Storees Gap
We handle transactional through the same flow system. **Missing**:
- Dedicated transactional alerts section (separate from marketing campaigns)
- API-first transactional sends
- Per-alert delivery metrics

---

## 8. Personalize — Web/App Experiences (Frame 55)

Web personalization campaigns list:
- Campaign name, type (Single Page / Multiple Pages), Status
- Target URLs (e.g., mydeal.com.au, birkenstock.in, moeshop.in)
- Created at timestamp

"MoEngage Personalize helps create connected experiences that bridge the gap between your user's needs and the product experience."

### Storees Gap
We have nothing here. This is a Phase 3+ feature — on-site content personalization (banners, pop-ups, product recommendations).

---

## 9. Content Blocks (Frame 60)

Reusable content blocks:
- Block name, label (e.g., `{{ContentBlock['TestIppenSubscribe']}}`)
- Type: HTML, Plain text
- Status: Active / Draft
- Tags: activation, promotional
- Usage count

"Content blocks allow marketers to reuse the same content across multiple campaigns."

### Storees Gap
We have templates but no reusable content blocks. Templates are per-campaign — blocks would let you share headers, footers, CTAs across templates.

---

## 10. Proactive Assistant — AI Insights (Frame 65-70)

AI-powered insight cards:
- **Conversion Rate Insight** (6 Dec 2023): "Conversion Rate (12.64K) has been 875.91% lower than the forecasted value of 123.35K. The difference is caused due to the variation in the user count from UTM Source: MOE_DIRECT/MOE_ORGANIC."
- **RFM Insight** (5 Sep 2022): "30,637 users are About to Sleep based on RFM modeling. It is important to re-engage these customers with your product before they are churned."
- Chart showing conversion rate trends vs actual
- Useful/Not Useful feedback buttons
- **Actions** dropdown on insights

### Storees Gap
We have no AI assistant. **This is Sherpa.** Key features:
- Automated anomaly detection
- RFM-based churn prediction
- Actionable recommendations with "Actions" button
- Forecasting vs actual comparison
- Historical insight timeline

---

## 11. User Profile — 360-Degree View (Frame 80-95)

### User Info Tab
- Avatar with initials, Registration status badge
- **Lifecycle**: Last Active, No. of Sessions
- **Conversion**: No. of Conversions, Lifetime Value
- **Acquisition**: First Seen, Publisher/Campaign source
- **Location**: City/State, Country
- **Reachability**: Push (Android/iOS/Web with TEST buttons), Email (TEST EMAIL), SMS (TEST SMS)
- **User Properties**: Tracked Custom Attributes, Acquisition attributes

### Activity Info Tab
- Event timeline with timestamps
- Event Source: SDK
- Platform: Android/iOS/Web/Other
- Event Type: Campaign Activity
- Expandable event details (Key/Value pairs): Event Time, Campaign Name, api_t, MOE Event Category, real_time_action
- **Event Filters**: Date Range, Event Platform (Android/iOS/Web/Other), Filter By Events or Campaigns
- "APPLY" button to filter

### Storees Gap
Our customer view has: Details, Orders, Activity tabs. **Missing**:
- Lifecycle/Conversion/Acquisition/Location card grid
- Reachability indicators with TEST buttons per channel
- Event source (SDK vs API) tracking
- Platform breakdown (Android/iOS/Web)
- Event filter panel with date range and platform
- Campaign attribution on events
- Registration status badge

---

## 12. Email Template Gallery (Frame 135)

Visual template picker with thumbnail previews:
- Author-Spotlight, Basic-Coupon, Basic-Ecommerce, Be-A-Gift-Giving-Hero
- Be-Part-Of-The-Change, Black-Friday, Black-Friday-Discount, Black-Friday-Tech-Retailer-Sale
- Booking confirmation, pet store, holiday themes

### Storees Gap
We have raw HTML templates. **Missing**:
- Visual template gallery with thumbnails
- Pre-built template library (e-commerce, holiday, promotional themes)
- Drag-and-drop email builder

---

## Priority Feature Gap Summary (Ranked by Demo Impact)

| Priority | Feature | MoEngage Module | Effort | Demo Impact |
|----------|---------|----------------|--------|-------------|
| **P0** | Dashboard time-series charts + trends | Dashboard | 2-3 days | HIGH — first thing shown |
| **P0** | Campaign performance metrics | Engage | 2-3 days | HIGH — proves ROI |
| **P1** | User profile 360-view upgrade | User Profiles | 2 days | HIGH — shows data depth |
| **P1** | Push notification channel | Engage | 3-5 days | HIGH — multi-channel |
| **P1** | Visual email template gallery | Content | 2 days | MEDIUM — looks polished |
| **P2** | Analytics/Behavior module | Analytics | 5-7 days | MEDIUM — shows power |
| **P2** | AI Proactive Assistant (insights) | Assistant | 3-5 days | MEDIUM — differentiation |
| **P2** | Campaign A/B testing | Engage | 3 days | MEDIUM — expected feature |
| **P3** | Transactional alerts | Inform | 2-3 days | LOW — backend feature |
| **P3** | Content blocks (reusable) | Content | 1-2 days | LOW — utility feature |
| **P3** | Web personalization | Personalize | 5+ days | LOW — advanced feature |
| **P3** | Audience sync (FB/Google) | Audience | 3-5 days | LOW — integration |
| **P3** | Sherpa (optimal send time) | AI | 5+ days | LOW — needs ML pipeline |

---

## What Storees Already Does Better

1. **AI Segment Builder** — Voice + text natural language → segment filters. MoEngage doesn't have this.
2. **Visual Flow Builder** — Our React Flow canvas with drag-and-drop is on par with MoEngage's flows.
3. **Domain-Aware Onboarding** — Ecommerce/Fintech/SaaS domain selection with pre-built templates.
4. **Event Debugger** — Live real-time event stream. MoEngage buries this in user profiles.
5. **Lifecycle Chart (RFM Grid)** — 9-cell visual grid. MoEngage shows RFM only in AI insights.
