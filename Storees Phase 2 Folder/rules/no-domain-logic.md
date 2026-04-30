# Rule: No Domain Logic

## Applies To
All files in `packages/ml/`, `packages/backend/src/services/`, `packages/segments/`

## The Rule
The core platform and ML engine must be completely vertical-agnostic. Domain-specific knowledge lives ONLY in Vertical Pack configurations, never in code.

## Forbidden Patterns
```python
# ❌ WRONG — domain-specific logic in model code
if tenant.vertical == "nbfc":
    features.append("loan_amount")
elif tenant.vertical == "ecommerce":
    features.append("cart_value")

# ❌ WRONG — hardcoded event names
if event.name == "order_completed":
    weight = 10

# ❌ WRONG — domain term in feature name
def compute_loan_repayment_ratio():
    ...
```

## Correct Patterns
```python
# ✅ RIGHT — read from tenant config
conversion_event = config.prediction_goals[goal_name].target_event
weight = config.interaction_mappings[event.name].weight

# ✅ RIGHT — generic feature names
def compute_conversion_frequency_trend():
    # Uses whatever event the tenant configured as "conversion"
    ...

# ✅ RIGHT — item attributes are generic JSONB
similarity = cosine_similarity(item_a.attributes, item_b.attributes)
# The attributes could be {category: "secured", interest: 12} (NBFC)
# or {category: "shoes", brand: "Nike", price: 4999} (ecommerce)
# The code doesn't know or care
```

## How to Test
Search the entire `packages/ml/` directory for these terms. If any appear in Python code (not in comments, not in program_*.md, not in test fixtures), it's a violation:
- "loan", "emi", "nbfc", "gold loan", "disbursed"
- "cart", "sku", "shopify", "order", "product" (as hardcoded strings, not as config values)
- "subscription", "plan", "upgrade", "churn" (as hardcoded strings)
- "booking", "court", "slot"
- "course", "lesson", "enrollment"

These terms MAY appear in:
- Vertical Pack JSON files (that's where they belong)
- program_*.md files (human instructions referencing specific contexts)
- Test fixtures with tenant-specific test data
- Documentation and comments
