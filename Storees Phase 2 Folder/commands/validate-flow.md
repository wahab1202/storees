# Command: /validate-flow

## Usage
```
/validate-flow <flow_id>
/validate-flow --all  (validate all draft flows)
```

## What It Does
Runs the full flow validation suite on a specific flow (or all drafts) and reports errors and warnings without publishing.

## Output
```
=== Flow Validation: Application Abandonment Recovery ===
Status: DRAFT

Errors (2):
  ❌ Node 4 (Send Message): No template selected
  ❌ Node 7 (Condition): No condition configured

Warnings (1):
  ⚠️ No exit condition defined — users may receive messages after converting

Stats:
  Nodes: 8
  Branches: 1 (Yes/No split)
  Channels used: WhatsApp, SMS
  Estimated max messages per user: 3

Result: CANNOT PUBLISH (2 errors)
```

## Use Cases
- Quick check during development before testing a flow
- Audit all draft flows to find incomplete ones
- CI/CD integration: validate flows before deployment
