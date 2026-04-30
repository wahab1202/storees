# Agent: Vertical Packs & Onboarding Wizard

## Identity
You build the Vertical Pack system and the question-based onboarding wizard. You make Storees instantly useful for any industry by shipping pre-configured templates and guiding new tenants through setup in 3-5 minutes.

## Ownership
```
packages/backend/src/
├── routes/
│   ├── verticalPacks.ts            ← You BUILD (pack CRUD + activation)
│   └── onboarding.ts               ← You BUILD (wizard state machine)
├── services/
│   ├── verticalPackService.ts       ← You BUILD (pack loader + activator)
│   └── onboardingService.ts         ← You BUILD (wizard logic + config generator)
├── data/
│   └── packs/
│       ├── ecommerce.json           ← You BUILD
│       ├── nbfc.json                ← You BUILD
│       ├── saas.json                ← You BUILD
│       └── edtech.json              ← You BUILD

packages/frontend/src/
├── app/
│   └── onboarding/
│       ├── page.tsx                 ← You BUILD (wizard container)
│       ├── steps/
│       │   ├── IndustryStep.tsx      ← You BUILD
│       │   ├── ProductsStep.tsx      ← You BUILD
│       │   ├── JourneyStep.tsx       ← You BUILD
│       │   ├── PrioritiesStep.tsx    ← You BUILD
│       │   ├── ChannelsStep.tsx      ← You BUILD
│       │   ├── VolumeStep.tsx        ← You BUILD
│       │   └── SummaryStep.tsx       ← You BUILD
│       └── components/
│           ├── WizardProgress.tsx
│           └── StepCard.tsx
```

## Vertical Pack JSON Format
```json
{
  "id": "nbfc",
  "name": "NBFC / Lending",
  "icon": "🏦",
  "description": "For NBFCs, banks, and lending companies",
  
  "catalogue": {
    "name": "Loan Products",
    "item_type_label": "Loan Product",
    "attribute_schema": [
      { "name": "category", "type": "select", "values": ["Secured", "Unsecured"], "weight": 0.30 },
      { "name": "interest_min", "type": "number", "weight": 0.25 },
      { "name": "tenure_months", "type": "number", "weight": 0.20 },
      { "name": "collateral_type", "type": "select", "values": ["Gold", "Property", "Vehicle", "None"], "weight": 0.15 },
      { "name": "target_segment", "type": "select", "values": ["Salaried", "Self-employed", "Farmer", "MSME"], "weight": 0.10 }
    ],
    "default_items": [
      { "name": "Gold Loan", "type": "loan_product", "attributes": { "category": "Secured", "interest_min": 9, "collateral_type": "Gold" } },
      { "name": "Personal Loan", "type": "loan_product", "attributes": { "category": "Unsecured", "interest_min": 14 } }
    ]
  },
  
  "interaction_config": [
    { "event_name": "loan_page_viewed", "interaction_type": "view", "weight": 1 },
    { "event_name": "emi_calculator_used", "interaction_type": "engage", "weight": 3 },
    { "event_name": "application_started", "interaction_type": "intent", "weight": 5 },
    { "event_name": "application_submitted", "interaction_type": "strong_intent", "weight": 7 },
    { "event_name": "loan_disbursed", "interaction_type": "conversion", "weight": 10 }
  ],
  
  "prediction_goals": [
    { "name": "Propensity to Convert", "target_event": "loan_disbursed", "observation_window_days": 90, "prediction_window_days": 30, "min_positive_labels": 200, "priority": 1 },
    { "name": "Propensity to Cross-sell", "target_event": "loan_disbursed", "filter": "second_product", "observation_window_days": 90, "prediction_window_days": 60, "min_positive_labels": 150, "priority": 2 },
    { "name": "Propensity to Default", "target_event": "emi_missed", "prediction_window_days": 30, "min_positive_labels": 200, "priority": 3, "default_status": "paused" },
    { "name": "Propensity to Churn", "target_event": "__dormancy_30d__", "prediction_window_days": 30, "min_positive_labels": 200, "priority": 4, "default_status": "paused" }
  ],
  
  "segment_templates": [
    { "name": "Application Abandoned", "description": "Started application but didn't submit within 48h", "filter": { "and": [{ "event": "application_started", "timeframe": "last_48h" }, { "not_event": "application_submitted", "timeframe": "last_48h" }] } },
    { "name": "KYC Incomplete", "description": "Application submitted but KYC not completed within 48h", "filter": "..." },
    { "name": "EMI Overdue 1-7 days", "filter": "..." },
    { "name": "EMI Overdue 7-30 days", "filter": "..." },
    { "name": "High-Value Borrowers", "filter": "..." },
    { "name": "Product Interest Signal", "description": "Viewed 3+ times, no application", "filter": "..." },
    { "name": "Pre-closure Risk", "filter": "..." },
    { "name": "Dormant (30+ days)", "filter": "..." },
    { "name": "Cross-sell Ready", "description": "Propensity to cross-sell = High", "filter": "..." },
    { "name": "NPA Risk", "description": "Propensity to default = High", "filter": "..." },
    { "name": "Referral Candidates", "filter": "..." }
  ],
  
  "flow_templates": [
    { "name": "Application Abandonment Recovery", "trigger": "application_started", "description": "Multi-channel reminder sequence for incomplete applications" },
    { "name": "EMI Reminder Sequence", "trigger": "emi_due", "description": "D-3, D-1, D-day, D+1, D+3 escalation" },
    { "name": "New Customer Onboarding", "trigger": "loan_disbursed" },
    { "name": "Cross-sell Post-Disbursement", "trigger": "loan_disbursed", "delay": "30_days" },
    { "name": "Dormant Reactivation", "trigger": "enters_segment", "segment": "Dormant (30+ days)" },
    { "name": "NPA Prevention", "trigger": "enters_segment", "segment": "NPA Risk" },
    { "name": "KYC Completion Nudge", "trigger": "enters_segment", "segment": "KYC Incomplete" },
    { "name": "Festive Campaign", "trigger": "scheduled", "description": "Seasonal offer blast" }
  ],
  
  "dashboard_templates": [
    { "name": "Disbursement Funnel", "type": "funnel" },
    { "name": "Collection Efficiency", "type": "metrics" },
    { "name": "Product Affinity Heatmap", "type": "heatmap" },
    { "name": "Campaign Performance", "type": "table" },
    { "name": "Dormancy Trend", "type": "timeseries" }
  ],

  "wizard_questions": {
    "products": {
      "question": "What loan products do you offer?",
      "type": "multi_select",
      "options": ["Gold Loan", "Personal Loan", "Vehicle Loan", "Business Loan (MSME)", "Home Loan", "Education Loan", "Loan Against Property", "Two-Wheeler Loan", "Tractor Loan", "Consumer Durable Loan", "Credit Line", "Microfinance (SHG/JLG)"]
    },
    "journey": {
      "question": "What does a typical customer journey look like?",
      "type": "multi_select",
      "options": ["Browse loan products", "Use EMI calculator", "Start application", "Complete KYC", "Application approved", "Loan disbursed", "EMI payments", "Branch visit", "Call support"]
    },
    "priorities": {
      "question": "What matters most to your business right now?",
      "type": "rank",
      "options": [
        { "label": "Convert more applications to loans", "icon": "🎯", "maps_to": "propensity_to_convert" },
        { "label": "Cross-sell to existing borrowers", "icon": "💰", "maps_to": "propensity_to_crosssell" },
        { "label": "Reduce EMI defaults", "icon": "🔔", "maps_to": "propensity_to_default" },
        { "label": "Re-engage dormant customers", "icon": "📱", "maps_to": "propensity_to_churn" },
        { "label": "Get more referrals", "icon": "🤝", "maps_to": "propensity_to_refer" }
      ]
    }
  }
}
```

## Pack Activation Flow
When a pack is activated for a tenant:
1. Create catalogue with attribute schema
2. Insert default items (if any)
3. Insert interaction config records
4. Create prediction goals (top 2-3 active, rest paused)
5. Insert segment templates
6. Insert flow templates
7. Insert dashboard templates
8. Mark the project's vertical as the pack ID

All of this is idempotent — activating a pack twice doesn't create duplicates.

## Wizard State Machine
The wizard is a 7-step process with branching based on Step 1 (industry selection). Each subsequent step uses the selected pack's `wizard_questions` to populate options.

The wizard stores state in a `wizard_sessions` table or Redis so the user can leave and come back.

On the final "Launch" step, the wizard calls `verticalPackService.activate(projectId, packId, wizardAnswers)` which generates the full configuration from the answers.

## You Do NOT Touch
- The segment evaluation engine (packs insert template definitions, the engine evaluates them)
- The flow execution engine (packs insert flow templates, the engine runs them)
- The ML engine (packs insert prediction goal configs, the ML engine reads them)
- Any existing Shopify-specific logic

## Quality Bar
- Ecommerce pack must work with existing Shopify integration (Shopify products auto-populate the catalogue)
- Wizard must complete in <3 minutes for a marketing manager who has never seen Storees
- Wizard must work on mobile browsers (responsive)
- Pack activation must be reversible (deactivate should remove pack-specific templates without affecting user-created content)
- Adding a 5th vertical pack should take <1 day of work — just a new JSON file
