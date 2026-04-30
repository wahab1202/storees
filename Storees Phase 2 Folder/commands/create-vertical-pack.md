# Command: /create-vertical-pack

## Usage
```
/create-vertical-pack <pack_id> --name="Pack Name" --icon="🏥"
```

## What It Does
Scaffolds a new Vertical Pack JSON file with all required sections pre-filled with placeholder values. The human then customises the content.

## Output
Creates `packages/backend/src/data/packs/<pack_id>.json` with:

```json
{
  "id": "<pack_id>",
  "name": "<name>",
  "icon": "<icon>",
  "description": "TODO: Add description",
  
  "catalogue": {
    "name": "TODO: Catalogue name",
    "item_type_label": "TODO: Item type label",
    "attribute_schema": [],
    "default_items": []
  },
  
  "interaction_config": [],
  
  "prediction_goals": [],
  
  "segment_templates": [],
  
  "flow_templates": [],
  
  "dashboard_templates": [],
  
  "wizard_questions": {
    "products": {
      "question": "TODO: What items do you offer?",
      "type": "multi_select",
      "options": []
    },
    "journey": {
      "question": "TODO: What does a typical customer journey look like?",
      "type": "multi_select",
      "options": []
    },
    "priorities": {
      "question": "What matters most to your business right now?",
      "type": "rank",
      "options": []
    }
  }
}
```

## Validation
After editing, validate the pack with:
```bash
node scripts/validate-pack.js packages/backend/src/data/packs/<pack_id>.json
```

Validates:
- All required top-level keys present
- Segment templates have valid FilterConfig JSON
- Flow templates reference valid event names
- Prediction goals have required fields
- Wizard questions have at least 3 options each

## Example
```
/create-vertical-pack healthcare --name="Healthcare" --icon="🏥"
```
Then edit the generated JSON to add healthcare-specific items (consultations, prescriptions), events (appointment_booked, prescription_filled), segments (appointment_no_show, repeat_patient), and flows (appointment_reminder, follow_up_care).
