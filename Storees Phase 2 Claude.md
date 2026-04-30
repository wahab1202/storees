# Storees — Development Guidelines

## Project Context

Storees is a **vertical-agnostic Customer Data Platform (CDP) and Marketing Automation Platform**. It collects behavioural events from any client application (ecommerce, NBFC/lending, SaaS, sports booking, EdTech, custom apps), builds unified customer profiles, runs AI/ML models for recommendations and predictions, and orchestrates personalised engagement campaigns across channels.

**Storees is the intelligence layer. Pinnacle is the delivery layer.** Storees decides WHO to send to, WHAT content, WHEN to send, WHICH channel. Pinnacle (the delivery partner) actually delivers WhatsApp, SMS, Email, and Push notifications. Storees never calls delivery APIs directly — it sends structured commands to a Pinnacle Delivery Service abstraction layer.

### What Already Works (Do NOT Rebuild)

A full codebase audit confirmed these components are production-quality and working end-to-end:

- **Event ingestion pipeline**: Shopify webhooks + server-side v1Events API → normalisation → identity resolution (race-safe ON CONFLICT) → DB persistence → BullMQ processing
- **Customer identity resolution**: external_id → email → phone resolution chain, multi-device, race-safe
- **Event debugger**: Real-time event stream viewer with 5s polling, filter, JSON expand, platform color coding
- **Segment builder**: Klaviyo-style AND/OR filter groups, 20+ operators, JSONB field queries, product subqueries, live member count preview
- **Segment evaluation engine**: FilterConfig → SQL WHERE clause translation → real Drizzle queries → batch membership updates → cached counts
- **Flow builder (backend)**: Full state machine — trigger evaluation (event name match + filter + audience + duplicate prevention) → trip creation → node walking (trigger → delay → condition → action → end) → BullMQ delayed jobs → email/SMS/WhatsApp sending → delivery tracking via Resend webhooks → exit conditions that cancel pending jobs
- **Campaign dispatch**: Working
- **RFM lifecycle chart**: Working computation
- **AI segment generation**: Groq-powered auto-segmentation
- **Domain-aware UI**: Ecommerce / Fintech / SaaS mode switching
- **Shopify integration**: OAuth + webhooks + historical sync, fully functional

**One known bug**: `enters_segment` / `exits_segment` events are never emitted by `segmentService.evaluateSegment()`. Constants and UI trigger dropdowns exist, but the events are never published. Fix: ~10 lines to publish events for `toAdd`/`toRemove` arrays.

### Tech Stack

- **Frontend**: Next.js 14 (App Router) + TypeScript + Tailwind CSS + shadcn/ui + TanStack Query v5 + Recharts
- **Backend**: Node.js + TypeScript + Express + Drizzle ORM
- **Database**: PostgreSQL + Redis (Upstash)
- **Event Queue**: BullMQ (Redis-backed)
- **ML Services**: Python (FastAPI) — XGBoost, LightGBM, scikit-learn, implicit (ALS), LightFM, pandas, numpy
- **Email (dev/test)**: Resend API (production delivery via Pinnacle)
- **Auth**: NextAuth.js
- **Hosting**: Vercel (frontend) + Railway (backend + Postgres + Redis)

### Monorepo Structure

```
storees/
├── packages/
│   ├── shared/          ← Types, constants, utils (ALL agents read this)
│   ├── backend/         ← Express routes, services, workers, DB schema
│   ├── frontend/        ← Next.js pages, components, hooks
│   ├── segments/        ← Evaluator, templates, lifecycle
│   ├── flows/           ← Templates + type contracts (runtime in backend)
│   └── ml/              ← NEW: AI/ML engine (Python)
│       ├── shared/      ← prepare.py, features.py, eval.py, config.py
│       ├── recommendations/
│       ├── propensity/
│       ├── affinity/
│       ├── bts/
│       └── nba/
├── docs/                ← Domain documentation
├── .claude/             ← Agent prompts, skills, rules
└── CLAUDE.md            ← This file
```

---

## Architecture: Four Core Entities

Everything in Storees operates on four generic entities. These entities have NO domain knowledge built in. They gain meaning through tenant configuration.

### User
An identified or anonymous individual. Has system properties (`first_seen`, `last_seen`, `device`) and unlimited custom properties (JSONB). Identity resolution merges anonymous sessions with known profiles via `identify()` calls.

### Item
Any entity the tenant wants to recommend, cross-sell, or track interactions against. Has a `type` (string), `catalogue_id`, `attributes` (JSONB), and `status`. Examples: a product SKU in ecommerce, a loan product in NBFC, a plan tier in SaaS, a course in EdTech, a court slot in sports booking.

### Event
A timestamped user action. Has a `name` (string), `properties` (JSONB), and optionally references an Item via `item_id`. Examples: `product_viewed`, `loan_page_viewed`, `feature_used`, `booking_completed`.

### Interaction
A computed relationship between a User and an Item, derived from Events. Has a `type`, `weight`, and `timestamp`. The Interaction Engine listens to events, applies the tenant's configured event-to-interaction weight mapping, and writes Interaction records. The recommendation engine operates exclusively on Interactions, never on raw Events.

**Critical rule**: The AI/ML engine (recommendations, propensity, affinity, BTS, NBA) operates ONLY on these four entities. No model code may reference domain-specific terms like "loan", "SKU", "subscription", "booking". If you find yourself writing `if vertical == "nbfc"` inside a model, you're doing it wrong.

---

## Vertical Packs

A Vertical Pack is a JSON configuration bundle that makes Storees immediately useful for a specific industry. Activating a pack loads configuration data into the tenant's workspace — it does NOT change platform code.

### What a Pack Contains
- Event schema presets (recommended event names and properties)
- Item catalogue schema presets (recommended attributes and types)
- Interaction weight configuration (which events → which weights)
- Pre-built segment templates (10-15 per vertical)
- Pre-built flow templates (6-10 per vertical)
- Pre-built dashboard templates (3-5 per vertical)
- Pre-built prediction goal configurations (3-5 per vertical)
- Integration guide documentation

### Available Packs
- **Ecommerce**: 8 segments, 8 flows, 4 dashboards, product-centric item schema
- **NBFC / Lending**: 11 segments, 8 flows, 5 dashboards, loan product item schema
- **SaaS**: 8 segments, 8 flows, 4 dashboards, plan/feature item schema
- **EdTech**: 7 segments, 7 flows, 4 dashboards, course item schema
- **Custom**: Empty — tenant defines everything through wizard or advanced config

### Adding a New Vertical
Adding a new vertical (e.g., Healthcare, Real Estate, Media) requires ZERO engineering. It is a new JSON pack definition (event schemas, item schemas, segment templates, flow templates, dashboards) that a product person creates in 2-3 days.

---

## Tenant Onboarding: Question-Based Wizard

New tenants are onboarded through a guided wizard, NOT raw configuration screens. The wizard asks business questions and auto-configures everything.

### Wizard Steps
1. **Industry selection**: Single select (Ecommerce, NBFC, SaaS, EdTech, Sports/Booking, Custom). Pre-fills subsequent steps with Vertical Pack defaults.
2. **Products/items offered**: Multi-select of vertical-specific options. Creates Items in catalogue with auto-filled attributes.
3. **Customer journey steps**: Multi-select of journey steps. Generates event-to-interaction weight mappings automatically.
4. **Business priorities**: Rank/drag-and-drop of 4-5 priorities in plain language. Top 2-3 become active Prediction Goals. Lower priorities created but paused.
5. **Communication channels**: Multi-select (WhatsApp, SMS, Email, Push, In-App). Configures NBA action space, BTS channel filtering, flow builder options.
6. **Customer volume estimate**: Single select (size ranges). Sets minimum data thresholds, model activation timelines, autoresearch parameters.
7. **Summary + Launch**: Review screen showing everything configured. Links to SDK setup guide. "Advanced Configuration" link for power users.

### Design principle
The tenant answers business questions ("What loan products do you offer?"), not technical questions ("What is the interaction decay half-life?"). The raw configuration screens (Item Catalogue, Interaction Weights, Prediction Goals) exist behind an "Advanced Configuration" link for power users. 90% of tenants never touch them.

---

## Pinnacle Integration

### Delivery Service Abstraction Layer
All message delivery goes through a `DeliveryService` class that:
1. Checks consent before every send (if user opted out of WhatsApp promotional, block the send)
2. Selects the channel from the flow/campaign configuration
3. Translates the send command to Pinnacle's API format
4. Handles retries with exponential backoff
5. Manages rate limiting (queue excess messages)
6. Receives delivery receipts from Pinnacle (sent, delivered, read, clicked, failed)
7. Writes receipt data back to the event store for campaign analytics, BTS computation, and NBA learning

Resend remains as a backend option for dev/testing environments. In production, Pinnacle is the delivery backend.

### Send command format
```typescript
interface SendCommand {
  userId: string;
  channel: 'whatsapp' | 'sms' | 'email' | 'push';
  templateId: string;
  variables: Record<string, string>;
  scheduledAt?: Date; // for BTS-delayed sends
  messageType: 'promotional' | 'transactional';
  flowTripId?: string; // for flow attribution
  campaignId?: string; // for campaign attribution
}
```

---

## AI/ML Engine

### Overview
Six models, all vertical-agnostic, all trained via the Karpathy Autoresearch pattern (autonomous overnight experimentation on laptop CPU — no GPU needed).

### Model 1 & 2: Recommendations (5 sub-models)

#### Co-occurrence (Co-view)
- **Algorithm**: Item-item co-occurrence matrix with PMI (Pointwise Mutual Information) normalisation on view-type Interactions within configurable session windows
- **Metric**: NDCG@K (K=10 for large catalogues, K=5 for small catalogues like NBFC with 15-40 items)
- **Realistic target**: 0.08–0.15 (sparse catalogue), 0.15–0.30 (rich catalogue)
- **Minimum data**: 500+ browsing sessions
- **Guardrail**: Coverage must be >20%. If the model only recommends the same 5 popular items, it is auto-rejected.
- **Training time**: 10-30 seconds on CPU

#### Co-purchase
- Same algorithm as Co-view but on conversion-type Interactions with wider time window (30-90 days)
- 1 day incremental build on Co-view codebase

#### Attribute-Based Similarity
- **Algorithm**: Cosine similarity on Item attribute vectors. Tenant configures which attributes and their relative weights.
- **Cold-start value**: Works from Day 0 with zero interaction data. Uses only the Item Catalogue.
- **Training time**: 5-15 seconds

#### Collaborative Filtering
- **Algorithm**: ALS (Alternating Least Squares) via `implicit` library, or LightFM hybrid model
- **Input**: User-Item Interaction matrix (rows=users, columns=items, values=weighted interaction scores with time decay)
- **Cold-start handling**: Users with <5 interactions fall back to Attribute-based + Trending. New items with <20 interactions use LightFM hybrid mode.
- **Minimum data**: 10,000+ interactions across 5,000+ users
- **Training time**: 30-90 seconds on CPU

#### Trending Items
- **Algorithm**: Time-decayed popularity scoring. Score = Σ(interaction_weight × e^(-λ × age_in_hours)). Configurable decay rate per tenant.
- **Training time**: 2-5 seconds

#### Recommendation API
Single endpoint: `GET /v1/recommend?userId=X&context=Y&limit=10`
Model selection logic based on data density:
- Anonymous, no item context → Trending
- Anonymous, viewing specific item → Attribute-based + Co-view
- Identified, <5 interactions → Attribute-based + Trending
- Identified, 5-50 interactions → Co-view + Attribute-based
- Identified, 50+ interactions → Collaborative Filtering primary, Co-view secondary
- Post-conversion context → Co-purchase for cross-sell

Response includes: ranked items, scores, model_source, explanation text.

### Model 3: Propensity Scoring

- **Algorithm**: XGBoost (primary) or LightGBM. Logistic Regression as baseline/fallback for small data.
- **Input**: 40+ generic behavioural features per user (recency, frequency, intensity, item engagement, channel behaviour, lifecycle stage, engagement trend, derived scores). See Feature Extraction section.
- **Metric**: AUC-ROC (primary, optimised by autoresearch). Precision@10% (secondary, logged as business sanity check). Brier Score (calibration check).
- **Realistic target**: 0.78–0.88 AUC-ROC with good features
- **Minimum data**: 200+ positive labels per Prediction Goal
- **Guardrail**: AUC above 0.90 is a RED FLAG — almost certainly data leakage. Investigate before celebrating.
- **Output**: Per-user propensity score (0.0–1.0) and bucket (High/Medium/Low) for each active Prediction Goal. Stored as user properties. Available in segment builder.
- **Explainability**: Top 5 contributing features per user shown in UI (XGBoost feature_importances_ + per-prediction SHAP values or feature contributions)
- **Prediction Goals**: Tenant-configurable via wizard or admin UI. Each goal defines: target event, observation window, prediction window, min positive labels. Vertical Packs ship with pre-configured goals.
- **First deployment goals for Pinnacle**: Propensity to Convert (application → disbursement) + Propensity to Cross-sell (take 2nd product)
- **Training time**: 15-60 seconds on CPU

### Model 4: Affinity Segments

- **Algorithm**: K-Means clustering on generic feature vectors. Silhouette score to auto-select optimal K (range 4-20).
- **Metric**: Silhouette Score. Realistic target: 0.25–0.45.
- **Validation**: 4-test approach:
  1. Silhouette > 0.20 (cluster quality)
  2. Adjusted Rand Index > 0.70 across random seeds (stability)
  3. Top features deviate >1 std dev from global mean (interpretability)
  4. Adding cluster ID as feature improves propensity AUC (downstream utility)
- **Auto-labelling**: Compute z-scores per feature per cluster. Top 3-4 features by |z-score| become distinguishing traits. Generate cluster name via template engine. Generate plain-language description via LLM (Claude API or Groq). Flag clusters with no distinguishing traits as "Undifferentiated" and exclude from AI targeting.
- **Dimensionality reduction**: Agent should try PCA (10-20 components) and raw features. Often improves both silhouette and interpretability.
- **Alternative algorithms**: Agent should also try HDBSCAN (finds noise points, variable cluster sizes) and Gaussian Mixture Models.
- **Training time**: 10-30 seconds on CPU

### Model 5: Best Time to Send (BTS)

- **Algorithm**: Per-user engagement histogram. 168 bins (24 hours × 7 days). Gaussian smoothing. Peak detection.
- **Metric**: Negative MAE (predicted best hour vs actual engagement hour). Realistic target: 2-3 hours MAE.
- **Cold-start handling**: Users with <15 engagement events → cohort average. Users with <5 → global average (tenant's configured default time).
- **Integration with flow builder**: New delay node option "Send at each user's Best Time." Orchestrator schedules individual BullMQ delayed jobs per user at their optimal time. Pinnacle receives a steady stream spread across 24 hours.
- **Fallback check**: If BTS improvement over fixed-time baseline is <5% open rate uplift, system reports "BTS adds insufficient value for this tenant" and recommends fixed-time sending.
- **Training time**: 5-15 seconds on CPU

### Model 6: Next Best Action (NBA)

- **Algorithm**: Thompson Sampling multi-armed bandit. Each action (channel × message variant) is an arm. Beta distribution prior, updated on each outcome.
- **Metric**: Cumulative reward in simulation on historical campaign data.
- **Context-awareness**: Uses user features (propensity score, engagement recency, preferred channel from BTS) as context for contextual bandits.
- **Learning timeline**: First 100 users = roughly equal exploration. By 500 users = 40%+ traffic to winner. By 2,000 users = 80%+ to winner with small exploration tail.
- **Autoresearch scope**: Agent experiments with bandit algorithm (Thompson vs UCB1 vs Epsilon-Greedy), exploration parameters, context features, segment-level vs global bandits.
- **Correction for logging bias**: Must use Inverse Propensity Scoring or Doubly Robust Estimation when simulating on historical data. Without this, the bandit will always recommend the most historically-used channel.
- **Training time**: 10-30 seconds (simulation)

### Feature Extraction Pipeline

40+ generic features computed per user from the event store. These features work across all verticals because they describe behaviour patterns, not domain-specific actions.

**Feature categories:**
- **Recency (5)**: days_since_last_event, days_since_last_conversion, days_since_first_seen, days_since_last_session, hours_since_last_event
- **Frequency (8)**: total_events_7d/14d/30d/90d, unique_event_types_30d, sessions_per_week_30d, events_per_session_30d, conversion_events_count_90d
- **Intensity (6)**: avg_events_per_session, max_events_single_session, event_trend_4w (slope), weekend_ratio, peak_hour_concentration, avg_session_duration_seconds
- **Item Engagement (5)**: unique_items_viewed_30d, unique_items_converted_90d, item_diversity_entropy, top_category_concentration, recommendation_click_rate
- **Channel Behaviour (4)**: primary_device (encoded), notification_open_rate_30d, email_click_rate_30d, inapp_response_rate_30d
- **Lifecycle (5)**: days_since_first_conversion, total_conversions, avg_days_between_conversions, days_since_last_conversion, conversion_frequency_trend
- **Engagement Trend (4)**: event_count_7d_vs_30d_ratio, session_length_trend_4w, page_breadth_trend_4w, engagement_acceleration
- **Derived Scores (3)**: rfm_score, engagement_composite_score, recommendation_interaction_rate

**Critical rule**: ALL features must be computable from generic events — no domain-specific column names. A "conversion event" is whatever the tenant configured in their Prediction Goal, not hardcoded "order_completed" or "loan_disbursed".

**Critical rule**: Feature extraction MUST take a `cutoff_date` parameter and NEVER look past it. This prevents temporal data leakage. The autoresearch agent CANNOT modify the feature extraction pipeline.

---

## Autoresearch Pattern

### How It Works
Each AI model has three files:
- `train_<model>.py` — the editable asset. Agent modifies configuration values, algorithm choice, hyperparameters, feature engineering steps. Prints `METRIC: <scalar>` at the end.
- `program_<model>.md` — human-authored instructions. Tells the agent what to try, constraints, metric, priorities.
- `serve.py` — serving API (fixed, not modified by agent)

Shared infrastructure (NOT modified by agent, EVER):
- `prepare.py` — data extraction from Storees DB, temporal train/val split
- `features.py` — generic feature extraction (40+ features)
- `eval.py` — evaluation harness (NDCG@K, AUC-ROC, Silhouette, Negative MAE, Cumulative Reward)
- `config.py` — tenant configuration loader

### The Loop
1. Agent reads `program_<model>.md`
2. Agent modifies `train_<model>.py` (changes hyperparameters, algorithm, feature engineering)
3. Script runs. Prints `METRIC: <value>`.
4. If metric improved: git commit with descriptive message. Keep the change.
5. If metric did not improve: revert the change.
6. Repeat 500+ times overnight.

### Non-Negotiable Autoresearch Rules
1. **The agent NEVER modifies `prepare.py`, `features.py`, `eval.py`, or `config.py`.** If the agent could change the evaluation function, it could trivially cheat.
2. **Temporal split is sacred.** Train data comes before validation data in time. The agent cannot change the split date, ratio, or method.
3. **Minimum data gates.** Below the threshold, the model outputs `METRIC: INSUFFICIENT_DATA` (treated as a skip, not a failure).
4. **Wall-clock time budget is hard.** 60 seconds for most models, 120 seconds for collaborative filtering. Exceeded = killed = failed experiment.
5. **Coverage check for recommendations.** Coverage <20% = auto-rejected regardless of NDCG.
6. **Calibration check for propensity.** Brier Score >0.25 = flagged as poorly calibrated.
7. **Git commit messages include metric value AND what changed.** Format: `autoresearch(<model>): exp <N> — <metric_name> <value> (+/-<delta>) — <description of change>`

### Production Retraining (Weekly Cycle)
- Monday 2:00 AM: `prepare.py` runs → fresh data extracted
- Monday 2:15 AM: `features.py` runs → user features updated
- Monday 2:30 AM: Autoresearch loops run (all 6 models, 4 hours, 30+ experiments each)
- Monday 6:30 AM: Best models promoted to production
- Monday 7:00 AM: Propensity scores written to user profiles, affinity clusters updated, recommendation matrices refreshed in Redis, BTS histograms updated

---

## UX Decisions (Locked)

### Navigation
Keep current sidebar structure. ADD **Analytics** as a new top-level section containing: Dashboards, Funnels, Cohorts, RFM, Predictions/Propensity.

### Flow Builder — COMPLETE REBUILD (Approach B)

**Remove React Flow entirely.** Replace with a custom structured vertical flow renderer.

#### Core principles:
- User only decides WHAT step to add, never WHERE to place it
- No drag-drop positioning. No free canvas movement. No manual connection drawing.
- Strictly top-to-bottom flow direction
- Horizontal branching only for condition nodes (Yes/No columns)

#### Interaction model:
- Every connection between nodes shows a `(+ Add Step)` button
- Clicking `+` opens an inline dropdown: Send Message, Wait/Delay, Condition, Webhook, End Flow
- Selecting a step type: inserts the node, auto-connects, pushes everything below down
- Condition nodes render two child columns (Yes/No), each with their own `+` buttons
- Clicking any node opens a **right-side drawer** for configuration (canvas stays visible on left)

#### Node types:
- ⚡ Trigger (event-based, segment entry/exit, scheduled)
- 📤 Send Message (channel selection, template picker, content form, AI generate)
- ⏱️ Wait / Delay (fixed duration, until specific time, until event occurs, **Send at Best Time**)
- 🔀 Condition (user property check, event check, segment membership, propensity score check)
- 🔗 Webhook (call external API)
- 🏁 End Flow

#### Validation:
- Real-time error count visible in top bar: "Errors (3)"
- Errors include: unconfigured nodes, missing template content, incomplete conditions, missing channel settings
- Flow cannot be published with errors > 0

#### Backend impact:
- NONE. The flow execution engine (triggerWorker.ts, flowExecutor.ts, flowWorker.ts) reads `{ nodes, edges }` regardless of how the frontend produces it. The custom renderer outputs the same data format.

### Flow Entry Point
- Primary: **Template gallery** with use-case cards, descriptions, preview summaries
- Secondary: "Start from scratch" button (visible but not the hero)
- Templates shown: Welcome Series, Onboarding, Abandoned Cart, Browse Abandonment, Re-activation, Post-purchase Feedback, Cross-sell/Upsell, EMI Reminder, Application Recovery, KYC Completion, NPA Prevention, Festive Campaign (varies by Vertical Pack)

### AI Placement
**Both embedded at point of use AND standalone AI Studio section.**
- Embedded: AI button inside push notification editor, email template editor, in-app message builder, segment builder. Contextual — generates content for exactly what the user is editing.
- Standalone AI Studio: Separate nav section for exploration, bulk generation, advanced prompting, template generation from use-case descriptions, flow structure generation from goal descriptions.

### Customer 360
**Rich from start.** The customer detail page shows:
- Profile attributes and identity fields
- Event timeline / activity log
- Segment memberships (which segments this user belongs to)
- Active journey trips (which flows this user is currently in)
- Propensity scores with top 5 contributing features (once AI engine is live)
- Recommendation scores (what would we recommend to this user)
- Campaign exposure history (what messages have been sent, delivery status, engagement)
- Affinity cluster membership with cluster description

### Prediction Explainability
**Medium (MoEngage level).** Score (High/Medium/Low) + top 5 contributing features per user. Example: "High propensity to convert because: 8 product views in last 7 days, EMI calculator used 3 times, engagement trend increasing, session duration above average, accessed from mobile."

Implementation: XGBoost `feature_importances_` for global feature ranking. Per-user SHAP values or `predict(output_margin=True)` contributions for individual explanations.

### UI Patterns
- **Counts everywhere**: template counts on tabs, error counts on flows, segment member counts, AI utilization counters
- **Template-first across the platform**: flows, push notifications, in-app messages, email — always start with template selection, then edit
- **Visual layout picker for message nodes**: pick a notification layout (simple, image, carousel) visually, then fill content
- **Loading states and empty states**: always show clear indicators. "Insufficient Data — need X more events to activate" for AI models that lack data.

---

## Cold Start Strategy

The system NEVER shows "no recommendations available." It gracefully degrades:

| Data Available | Models Active | User Experience |
|---|---|---|
| Day 0: Zero interactions | Attribute-based + Trending | "Similar products" + "Popular now" |
| Week 1: ~500-2,000 events | + Co-occurrence | "Also viewed" recommendations appear |
| Month 1: ~10,000-50,000 events | + Propensity (if enough positive labels) + BTS (if enough engagement events) | AI models appear on dashboard. Scores in segment builder. |
| Month 3+: 50,000+ events | + Collaborative Filtering + Affinity Segments | Full personalisation. All models operational. |

Models that don't have enough data display "Insufficient Data — need X more [events/labels] to activate" on the dashboard with a progress indicator. They do NOT produce fake predictions.

---

## Phased Build Plan

### Phase 0: Fix + Upgrade + Generic Platform (Weeks 1-3)
- Fix segment-triggered flows bug (~10 lines)
- Pinnacle Delivery Service abstraction layer
- Generic Item Catalogue (upgrade product model to generic Items with JSONB attributes)
- Interaction Engine (event → interaction weight mapping, configurable per tenant)
- Interaction Weight Config UI
- Client SDK (Web — TypeScript): init, identify, track, page, setUserProperties, setConsent, reset
- Client SDK (Flutter — Dart): same methods, offline queue, lifecycle hooks
- Consent Management Service
- Vertical Pack loader + 4 packs (Ecommerce, NBFC, SaaS, EdTech)
- Onboarding wizard (question-based, 7 steps)

### Phase 1: Analytics + UX Polish (Weeks 3-5)
- Analytics nav section (new top-level)
- Funnel builder (multi-step event funnels, drop-off analysis, segment/channel breakdown)
- Cohort analytics (retention + behavioural cohorts, heatmap visualisation)
- Customer 360 page (rich: profile + events + segments + journeys + propensity + campaigns)
- Dashboard templates per vertical
- Flow builder rebuild (Approach B — custom structured renderer)
- Template-first flow entry (gallery with use-case cards)
- Flow validation error counter
- Right-drawer node editing
- Prediction explainability UI (score + top 5 features)
- Counts everywhere (templates, errors, segments, AI utilization)

### Phase 2: AI/ML Engine (Weeks 4-8)
- ML package setup (Python, FastAPI)
- prepare.py (data extraction from Storees DB, temporal split)
- features.py (40+ generic features)
- eval.py (evaluation harness — NDCG, AUC-ROC, Silhouette, MAE, Reward)
- config.py (tenant configuration loader)
- Recommendation: Co-occurrence + Co-purchase + Trending models
- Recommendation: Attribute-based similarity model
- Recommendation: Collaborative Filtering (ALS/LightFM)
- Recommendation API (unified endpoint, model selection logic)
- Prediction Goal Config UI
- Propensity Scoring Engine (generic XGBoost pipeline, configurable goals)
- Affinity Segments (K-Means + auto-labelling + LLM description)
- Best Time to Send (histograms, flow builder integration)
- AI scores in segment builder (propensity, affinity, recommendation as filter conditions)
- program.md files for all models
- Autoresearch overnight runs (all 6 models)

### Phase 3: In-App Personalisation (Weeks 7-9)
- In-App Message SDK (Web): modals, bottom sheets, banners, tooltips, frequency capping
- In-App Message SDK (Flutter): native overlay widgets
- Dynamic Banner API: renderBanner(slotId), content selection from recommendations + campaigns
- Web Personalisation JS: lightweight snippet, dynamic banners, exit-intent, anonymous personalisation
- Cards (persistent in-app feed): fetchCards() API, read/expire tracking

### Phase 4: NBA + Advanced Features (Weeks 8-11)
- Next Best Action (Thompson Sampling bandit, flow builder integration)
- Intelligent Path Optimiser (full-branch A/B testing, auto-convergence)
- PII Tokenisation (token-based PII handling, just-in-time resolution via Pinnacle)
- AI Studio standalone section (exploration, bulk generation, advanced prompting)
- Embedded AI at point of use (push editor, email editor, in-app builder, segment builder)
- Ad audience sync (Facebook/Google — stretch goal)

---

## Code Conventions

### Naming
- **Components**: `PascalCase.tsx` (`CustomerList.tsx`, `SegmentBuilder.tsx`, `FlowRenderer.tsx`)
- **Utils/services**: `camelCase.ts` (`deliveryService.ts`, `interactionEngine.ts`)
- **Hooks**: `useCamelCase.ts` (`useCustomers.ts`, `useRecommendations.ts`)
- **Types**: `type PascalCase` (use `type` over `interface`, except for React component props)
- **Constants**: `UPPER_SNAKE_CASE` (`STANDARD_EVENTS`, `INTERACTION_WEIGHTS`)
- **Database columns**: `snake_case` in Postgres, `camelCase` in TypeScript — map at boundaries
- **Prices/money**: Always in smallest currency unit as integers (paise), never floats
- **Python (ML)**: `snake_case` for everything. PEP 8. Type hints on all function signatures.

### Imports
1. React/Next → 2. Third-party → 3. `@/` alias imports → 4. Relative imports
- Use `import type { ... }` for type-only imports
- Use `@/components/ui/*` for shadcn, `@/lib/*` for shared utilities

### API Conventions
- All API responses use `ApiResponse<T>` or `PaginatedResponse<T>` wrapper types
- All error responses: `{ success: false, error: "message" }`
- Pagination: `?page=1&pageSize=25`, response includes `pagination` object
- Dates: ISO 8601 strings in API, `Date` objects in TypeScript

### Database Conventions
- All tables have `id` (UUID), `created_at`, `updated_at`
- Multi-tenant: every table has `project_id` column
- JSONB for flexible schemas (filters, properties, attributes, nodes)
- Use Drizzle ORM for type-safe queries
- Migrations in `packages/backend/src/db/migrations/`

### ML Conventions
- All model training scripts print `METRIC: <scalar_value>` as the last line of stdout
- All models save artifacts to `models/<model_name>/<version>/` directory
- Model versioning: timestamp-based directories, latest symlink
- Feature store: PostgreSQL table `user_features` with `user_id`, `feature_name`, `feature_value`, `computed_at`
- Recommendation cache: Redis with key pattern `reco:<model>:<item_id>` or `reco:user:<user_id>`
- Propensity scores: written to `user_properties` table as `propensity_<goal_name>` (float) and `propensity_<goal_name>_bucket` (string: High/Medium/Low)

### Commit Convention
```
type(scope): brief description

- Detail 1
- Detail 2
```
Types: `feat`, `fix`, `refactor`, `docs`, `test`, `chore`, `autoresearch`
Scopes: `backend`, `frontend`, `segments`, `flows`, `ml`, `shared`, `docs`

---

## Non-Negotiable Rules

1. **Storees is the brain, Pinnacle is the muscle.** Never call SMS/WhatsApp/Email delivery APIs directly. Always go through the Delivery Service abstraction.
2. **Temporal data splits only.** Never split data randomly for any ML evaluation. Train on past, validate on future. No exceptions.
3. **No domain-specific logic in the core platform.** Domain specificity lives ONLY in Vertical Pack configurations. If you're writing `if (vertical === "nbfc")` in platform code, refactor to use configuration.
4. **Minimum data gates are real.** Models refuse to train below thresholds. They show "Insufficient Data" honestly. They never produce fake predictions.
5. **AUC > 0.90 is a bug, not a feature.** Investigate for data leakage before celebrating.
6. **The autoresearch agent cannot modify infrastructure files** (`prepare.py`, `features.py`, `eval.py`, `config.py`). Only `train_<model>.py` files are editable.
7. **Every AI score must be explainable.** No black box predictions in the UI. Always show top contributing features alongside the score.
8. **The flow builder has no free canvas.** Structured vertical flow only. Users decide what step comes next, not where to place it.
9. **Template-first everywhere.** Flows, messages, in-app experiences — always start with a template gallery, blank canvas is secondary.
10. **Counts everywhere.** Template counts, error counts, member counts, utilization counters. The user always knows the system's state.
