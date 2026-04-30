# Skill: Vertical Pack Authoring

## When to Use
Invoke this skill when creating a new Vertical Pack or modifying an existing one.

## Pack File Location
`packages/backend/src/data/packs/<vertical_id>.json`

## Complete Pack JSON Schema
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
      { "key": "category", "type": "select", "options": ["Secured", "Unsecured"], "weight": 0.30 },
      { "key": "interest_min", "type": "number", "label": "Min Interest Rate (%)", "weight": 0.25 },
      { "key": "tenure_months", "type": "number", "label": "Tenure (months)", "weight": 0.20 },
      { "key": "collateral_type", "type": "select", "options": ["Gold", "Property", "Vehicle", "None"], "weight": 0.15 },
      { "key": "target_segment", "type": "select", "options": ["Salaried", "Self-employed", "Farmer", "MSME"], "weight": 0.10 }
    ],
    "suggested_items": [
      { "name": "Gold Loan", "attributes": { "category": "Secured", "collateral_type": "Gold" } },
      { "name": "Personal Loan", "attributes": { "category": "Unsecured", "collateral_type": "None" } }
    ]
  },

  "events": {
    "suggested_schema": [
      { "name": "loan_page_viewed", "description": "User viewed a loan product page", "properties": ["item_id", "source"] },
      { "name": "emi_calculator_used", "description": "User used the EMI calculator", "properties": ["item_id", "amount", "tenure"] },
      { "name": "application_started", "description": "User began a loan application", "properties": ["item_id", "amount"] },
      { "name": "kyc_completed", "description": "User completed KYC verification", "properties": ["method"] },
      { "name": "loan_disbursed", "description": "Loan was disbursed to the user", "properties": ["loan_id", "amount", "tenure", "rate"] },
      { "name": "emi_paid", "description": "User paid an EMI", "properties": ["loan_id", "amount", "method"] },
      { "name": "emi_missed", "description": "User missed an EMI payment", "properties": ["loan_id", "amount", "days_overdue"] }
    ]
  },

  "interaction_weights": [
    { "event_name": "loan_page_viewed", "interaction_type": "view", "weight": 1 },
    { "event_name": "emi_calculator_used", "interaction_type": "engage", "weight": 3 },
    { "event_name": "application_started", "interaction_type": "intent", "weight": 5 },
    { "event_name": "application_submitted", "interaction_type": "strong_intent", "weight": 7 },
    { "event_name": "loan_disbursed", "interaction_type": "conversion", "weight": 10 }
  ],

  "interaction_decay_days": 90,

  "prediction_goals": [
    {
      "name": "propensity_to_convert",
      "label": "Propensity to Convert",
      "description": "How likely is this applicant to complete their loan application and get disbursed?",
      "target_event": "loan_disbursed",
      "observation_window_days": 90,
      "prediction_window_days": 30,
      "min_positive_labels": 200,
      "priority": 1
    },
    {
      "name": "propensity_to_crosssell",
      "label": "Propensity to Cross-sell",
      "description": "How likely is this single-product borrower to take a second product?",
      "target_event": "loan_disbursed",
      "observation_window_days": 180,
      "prediction_window_days": 60,
      "min_positive_labels": 150,
      "priority": 2
    }
  ],

  "segments": [
    {
      "name": "Application Abandoned",
      "description": "Users who started but didn't complete an application in the last 7 days",
      "filter": {
        "operator": "AND",
        "conditions": [
          { "type": "event", "event": "application_started", "operator": "did", "timeframe": "last_7_days" },
          { "type": "event", "event": "application_submitted", "operator": "did_not", "timeframe": "last_7_days" }
        ]
      }
    }
  ],

  "flows": [
    {
      "name": "Application Abandonment Recovery",
      "description": "Re-engage users who started but didn't complete a loan application",
      "trigger": { "event": "application_started" },
      "nodes": [
        { "type": "delay", "config": { "duration": 2, "unit": "hours" } },
        { "type": "condition", "config": { "check": "event_occurred", "event": "application_submitted" } },
        { "type": "send_message", "branch": "no", "config": { "channel": "whatsapp", "template": "application_reminder" } },
        { "type": "delay", "branch": "no", "config": { "duration": 24, "unit": "hours" } },
        { "type": "send_message", "branch": "no", "config": { "channel": "sms", "template": "application_urgent" } }
      ],
      "exit_condition": { "event": "application_submitted" }
    }
  ],

  "dashboards": [
    {
      "name": "Disbursement Funnel",
      "description": "Track conversion from application to disbursement",
      "type": "funnel",
      "steps": ["application_started", "kyc_completed", "application_submitted", "loan_approved", "loan_disbursed"]
    }
  ],

  "wizard_config": {
    "step2_label": "What loan products do you offer?",
    "step2_options": ["Gold Loan", "Personal Loan", "Vehicle Loan", "Business Loan", "Home Loan", "Education Loan", "Two-Wheeler Loan", "Loan Against Property", "Tractor Loan", "Credit Line"],
    "step3_label": "What does a typical customer journey look like?",
    "step3_options": ["Browse loan products", "Use EMI calculator", "Start application", "Complete KYC", "Application approved", "Loan disbursed", "EMI payments", "Visit branch"],
    "step4_priorities": [
      { "id": "convert", "label": "Convert more applications to loans", "icon": "🎯" },
      { "id": "crosssell", "label": "Cross-sell to existing borrowers", "icon": "💰" },
      { "id": "default", "label": "Reduce EMI defaults", "icon": "🔔" },
      { "id": "reengage", "label": "Re-engage dormant customers", "icon": "📱" },
      { "id": "referral", "label": "Get more referrals", "icon": "🤝" }
    ]
  }
}
```

## Creating a New Vertical Pack

### Step 1: Copy an existing pack
```bash
cp packages/backend/src/data/packs/nbfc.json packages/backend/src/data/packs/healthcare.json
```

### Step 2: Replace ALL domain-specific content
- Change catalogue attributes to match the new domain
- Change event names and properties
- Change interaction weights (what events are view/engage/intent/conversion in this domain?)
- Change prediction goals (what does "success" mean here?)
- Change segment templates
- Change flow templates
- Change dashboard templates
- Change wizard options

### Step 3: Test pack activation
```bash
# In the API, activate the pack for a test tenant:
curl -X POST http://localhost:3001/api/vertical-packs/activate \
  -H "Content-Type: application/json" \
  -d '{"tenantId": "test", "packId": "healthcare"}'
```

### Step 4: Verify
- Item catalogue schema created with correct attributes
- Interaction weight mappings created
- Prediction goals created (with correct target events)
- Segment templates available in segment builder
- Flow templates available in template gallery
- Dashboard templates available in analytics

## Rules
- Pack JSON files are CONFIGURATION, not code. They never contain executable logic.
- All event names in the pack must use snake_case.
- Interaction weights must sum logically (view < engage < intent < conversion).
- Prediction goals must reference events that exist in the events schema.
- Segment filters must use the standard FilterConfig format that the segment evaluator understands.
- Flow templates must use the standard nodes/edges format that the flow executor understands.
