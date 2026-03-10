# AI Domain — Segment AI Builder

> **Milestone**: 2 — AI Segment Builder
> **Goal**: Natural language + voice → FilterConfig JSON → pre-populate SegmentFilterBuilder
> **Model**: Google Gemini 2.0 Flash (free tier)
> **Inspiration**: Klaviyo Segments AI, Zepic Zenie AI

---

## Overview

Users can describe a customer segment in natural language (typed or spoken, in any language) and the system converts it into a `FilterConfig` object that pre-populates the existing `SegmentFilterBuilder` UI. The user always reviews and confirms before saving.

**Supported languages**: English, Tamil, French, Spanish, Mandarin, Hindi, and any language Gemini Flash supports (100+).

---

## Architecture

```
┌─────────────────────────────────────────────────────┐
│  Frontend (Chat Panel)                               │
│                                                      │
│  [Mic Button] → Web Speech API → text               │
│  [Text Input] ────────────────→ text                 │
│  [Language Chips] → speechRecognition.lang           │
│                         │                            │
│                    POST /api/ai/segment              │
│                         │                            │
│                         ▼                            │
│  ┌──────────────────────────────────────┐            │
│  │  Backend: aiSegmentService.ts        │            │
│  │                                      │            │
│  │  1. Build system prompt              │            │
│  │     - FilterConfig JSON schema       │            │
│  │     - Available fields + operators   │            │
│  │     - Few-shot examples              │            │
│  │  2. Call Gemini Flash API            │            │
│  │     - responseMimeType: JSON         │            │
│  │  3. Validate output against schema   │            │
│  │  4. Return FilterConfig              │            │
│  └──────────────────────────────────────┘            │
│                         │                            │
│                         ▼                            │
│  ┌──────────────────────────────────────┐            │
│  │  Frontend: Preview parsed filters    │            │
│  │  [Apply to Builder →] button         │            │
│  │  Populates SegmentFilterBuilder      │            │
│  └──────────────────────────────────────┘            │
└─────────────────────────────────────────────────────┘
```

---

## Functional Requirements

### FR-1: Natural Language Input
- Text input field in the AI chat panel
- Accepts any language — Gemini handles translation internally
- No explicit translation step needed
- Conversational context within session ("now add shoes filter", "change to 60 days")

### FR-2: Voice Input
- Microphone button using **Web Speech API** (`SpeechRecognition`)
- Language auto-detection with manual override via language chips
- Supported languages for speech: `en-US`, `ta-IN`, `fr-FR`, `es-ES`, `zh-CN`, `hi-IN`
- Browser-native — zero cost, no external API
- Fallback: text-only input if browser doesn't support Web Speech API

### FR-3: FilterConfig Generation
- LLM converts natural language → `FilterConfig` JSON
- System prompt includes:
  - Full FilterConfig schema definition
  - All available fields with their types and valid operators
  - 5-10 few-shot examples covering common patterns
  - Instruction to output ONLY valid JSON matching the schema
- Gemini `responseMimeType: "application/json"` ensures valid JSON output
- Backend validates output against FilterConfig schema before returning

### FR-4: Preview & Apply
- AI panel shows human-readable preview of generated filters
- "Apply to Builder" button populates the left-side SegmentFilterBuilder
- User can manually edit filters after applying
- Existing filters in the builder are REPLACED (not merged) on apply

### FR-5: Conversational Context
- Chat maintains message history within the session
- Follow-up messages can modify the current filter:
  - "also add customers from Chennai" → appends a rule
  - "change the amount to 10000" → modifies existing rule value
  - "remove the date filter" → removes a rule
- Context is session-scoped — resets on page navigation

### FR-6: Error Handling
- If LLM returns invalid/unparseable output → retry once, then show error message
- If field doesn't exist in schema → show "I couldn't map [X] to a filter field"
- If API key is missing → hide AI panel, show only manual builder
- Rate limit exceeded → show "AI assistant is busy, please try again"

---

## Available Fields for AI Mapping

The LLM must map natural language to these fields:

### Purchase Activity
| Field | Type | Operators |
|-------|------|-----------|
| `totalSpent` | number | `greater_than`, `less_than`, `between`, `is` |
| `avgOrderValue` | number | `greater_than`, `less_than`, `between` |
| `lastOrderDate` | date | `is_before`, `is_after`, `between` |
| `daysSinceLastOrder` | number | `greater_than`, `less_than`, `between` |

### Product Filters
| Field | Type | Operators |
|-------|------|-----------|
| `productName` | product | `has_purchased`, `has_not_purchased` |

### Order Frequency
| Field | Type | Operators |
|-------|------|-----------|
| `totalOrders` | number | `greater_than`, `less_than`, `between`, `is` |
| `hasDiscountOrders` | boolean | `is_true`, `is_false` |
| `discountOrderPercentage` | number | `greater_than`, `less_than` |

### Customer Properties
| Field | Type | Operators |
|-------|------|-----------|
| `name` | string | `contains`, `begins_with`, `is` |
| `email` | string | `contains`, `ends_with`, `is` |
| `city` | string | `is`, `contains` |
| `clv` | number | `greater_than`, `less_than`, `between` |
| `daysSinceFirstSeen` | number | `greater_than`, `less_than` |

### Engagement
| Field | Type | Operators |
|-------|------|-----------|
| `emailSubscribed` | boolean | `is_true`, `is_false` |
| `smsSubscribed` | boolean | `is_true`, `is_false` |

### Subscriptions
| Field | Type | Operators |
|-------|------|-----------|
| `whatsappSubscribed` | boolean | `is_true`, `is_false` |
| `pushSubscribed` | boolean | `is_true`, `is_false` |

---

## Few-Shot Examples (for System Prompt)

```json
[
  {
    "input": "Customers who spent more than 5000 rupees",
    "output": {
      "logic": "AND",
      "rules": [
        { "field": "totalSpent", "operator": "greater_than", "value": 500000 }
      ]
    },
    "note": "Money stored in paise (smallest unit), so ₹5000 = 500000"
  },
  {
    "input": "People who bought more than 3 times in the last 30 days",
    "output": {
      "logic": "AND",
      "rules": [
        { "field": "totalOrders", "operator": "greater_than", "value": 3 },
        { "field": "daysSinceLastOrder", "operator": "less_than", "value": 30 }
      ]
    }
  },
  {
    "input": "கடந்த 90 நாட்களில் ஆர்டர் செய்யாத வாடிக்கையாளர்கள்",
    "output": {
      "logic": "AND",
      "rules": [
        { "field": "daysSinceLastOrder", "operator": "greater_than", "value": 90 }
      ]
    },
    "note": "Tamil input: customers who haven't ordered in last 90 days"
  },
  {
    "input": "High value customers from Chennai who are email subscribers",
    "output": {
      "logic": "AND",
      "rules": [
        { "field": "totalSpent", "operator": "greater_than", "value": 1000000 },
        { "field": "city", "operator": "is", "value": "Chennai" },
        { "field": "emailSubscribed", "operator": "is_true", "value": true }
      ]
    }
  },
  {
    "input": "Clients qui ont acheté des chaussures",
    "output": {
      "logic": "AND",
      "rules": [
        { "field": "productName", "operator": "has_purchased", "value": "shoes" }
      ]
    },
    "note": "French input: clients who purchased shoes"
  }
]
```

---

## Non-Functional Requirements

### Performance
- LLM response time: < 3 seconds (Gemini Flash typically < 1s)
- Voice recognition: real-time (browser-native)

### Cost
- Gemini 2.0 Flash free tier: 15 RPM, 1M tokens/day, 1500 requests/day
- Average query: ~500 tokens (prompt) + ~200 tokens (response)
- At scale (paid): ~$0.075/M input, ~$0.30/M output → $0.38 per 10,000 queries

### Security
- API key stored server-side only (`GEMINI_API_KEY` in backend `.env`)
- Frontend never touches the LLM directly
- Input sanitized before sending to LLM (strip HTML, limit length to 500 chars)
- Output validated against FilterConfig schema before returning to frontend

### Browser Support
- Web Speech API: Chrome, Edge, Safari (no Firefox — fallback to text-only)
- SpeechRecognition language support varies by browser/OS

---

## UI Layout

### Create/Edit Segment Pages — Split Layout

```
Before (current):   max-w-4xl centered
After (new):        grid grid-cols-[1fr_380px] gap-6 full-width

┌──────────────────────────────┬──────────────────────────┐
│  LEFT SIDE (existing)         │  RIGHT SIDE (new)        │
│                               │                          │
│  Segment Details card         │  🤖 Segment AI           │
│  ┌────────────────────┐      │                          │
│  │ Name               │      │  Chat message history    │
│  │ Description        │      │  ┌──────────────────┐   │
│  └────────────────────┘      │  │ User: "customers  │   │
│                               │  │  who spent > 5k"  │   │
│  Conditions card              │  │                    │   │
│  ┌────────────────────┐      │  │ AI: Generated 1    │   │
│  │ Filter rules       │      │  │  filter rule:      │   │
│  │ + Add condition     │      │  │  • totalSpent > 5k │   │
│  └────────────────────┘      │  │                    │   │
│                               │  │ [Apply to Builder] │   │
│                               │  └──────────────────┘   │
│                               │                          │
│                               │  ┌────────────────────┐ │
│                               │  │ 🎤 Type or speak.. │ │
│                               │  └────────────────────┘ │
│                               │                          │
│                               │  🌐 EN  TA  FR  ES  ZH  │
│                               │     HI                   │
└──────────────────────────────┴──────────────────────────┘
```

### Mobile Layout
- AI panel collapses into a floating "AI" button (bottom-right)
- Clicking opens a bottom sheet with the chat interface
- Same functionality, just repositioned

---

## Dependencies

| Dependency | Type | Purpose |
|------------|------|---------|
| Gemini 2.0 Flash API | External API | LLM for NL → FilterConfig |
| Web Speech API | Browser API | Voice-to-text (free) |
| `@storees/shared` FilterConfig type | Internal | Schema validation |
| Existing SegmentFilterBuilder | Internal | UI that receives AI output |

---

## Out of Scope (This Milestone)

- AI-generated segment names/descriptions (could add later)
- Segment performance predictions ("this segment will have ~X members")
- AI explanation of why a customer is/isn't in a segment
- Multi-turn refinement with member count preview
- Custom field definitions beyond the fixed schema above
