# Agent: Advanced Features

## Identity
You build the final layer of capabilities: PII Tokenisation for regulated clients, the standalone AI Studio section, and the Intelligent Path Optimiser. These features take Storees from "good enough" to "enterprise-ready."

## Ownership
```
packages/backend/src/
├── services/
│   ├── piiTokenService.ts           ← You BUILD
│   ├── aiStudioService.ts           ← You BUILD
│   └── pathOptimizerService.ts      ← You BUILD
├── routes/
│   ├── piiTokens.ts                 ← You BUILD
│   ├── aiStudio.ts                  ← You BUILD
│   └── pathOptimizer.ts             ← You BUILD

packages/frontend/src/
├── app/
│   ├── ai-studio/
│   │   ├── page.tsx                 ← You BUILD (standalone AI section)
│   │   ├── copy-generator/page.tsx  ← You BUILD
│   │   ├── template-generator/page.tsx ← You BUILD
│   │   └── flow-generator/page.tsx  ← You BUILD
│   └── settings/
│       └── pii/page.tsx             ← You BUILD (PII config)
```

## PII Tokenisation

### Why
NBFCs and banks handle Aadhaar numbers, PAN numbers, account numbers, credit scores. Storees must NEVER store raw PII in its own database if the tenant enables PII tokenisation. Instead, Storees stores opaque tokens. At send-time, Pinnacle resolves the token to the actual value via a resolver endpoint hosted by the tenant.

### Architecture
```
Tenant's System                    Storees DB              Pinnacle
┌───────────────┐                 ┌───────────┐           ┌──────────┐
│ PAN: ABCDE1234│ ──tokenise──→  │ Token:    │ ──send──→ │ Template:│
│ Phone: +91... │                │ tok_xyz123│           │ Hi {{name}},│
│ Aadhaar: xxxx │                │           │           │ your PAN │
└───────────────┘                └───────────┘           │ {{pan}}  │
                                       │                 └──────┬───┘
                                       │                        │
                                       │    ┌──resolve──────────┘
                                       │    │
                                       │    ▼
                                       │  Tenant's Resolver API
                                       │  POST /resolve-tokens
                                       │  { tokens: ["tok_xyz123"] }
                                       │  → { "tok_xyz123": "ABCDE1234F" }
```

### Token Flow
1. Tenant enables PII tokenisation in Settings
2. Tenant configures: which user properties are PII (list of field names)
3. Tenant provides: resolver endpoint URL + auth token
4. When Storees receives user data (via SDK identify() or API), PII fields are:
   - Sent to the tenant's tokenisation endpoint → receive tokens back
   - Tokens stored in Storees user_properties instead of raw values
5. When Storees sends a message via Pinnacle:
   - Template has `{{pan_number}}` variable
   - Storees passes `{ pan_number: "tok_xyz123", resolver_url: "https://tenant.com/resolve" }` to Pinnacle
   - Pinnacle calls the resolver before rendering the template
   - Resolved value is used in the message, then discarded (not stored by Pinnacle)

### Implementation
```typescript
interface PiiConfig {
  enabled: boolean;
  piiFields: string[];  // ["pan_number", "aadhaar", "account_number"]
  resolverUrl: string;
  resolverAuthToken: string;
  tokenPrefix: string;  // "tok_" — helps identify tokenised values
}

class PiiTokenService {
  async tokenise(projectId: string, userId: string, properties: Record<string, any>): Promise<Record<string, any>> {
    const config = await getPiiConfig(projectId);
    if (!config.enabled) return properties;
    
    const tokenised = { ...properties };
    for (const field of config.piiFields) {
      if (properties[field]) {
        tokenised[field] = await this.createToken(projectId, userId, field, properties[field]);
        // Raw value is NEVER stored — only the token
      }
    }
    return tokenised;
  }
}
```

## AI Studio (Standalone Section)

### Navigation
New top-level sidebar item: "AI Studio" with sub-pages.

### Copy Generator
```
┌─────────────────────────────────────────────────────┐
│  AI Copy Generator                                   │
│                                                      │
│  What are you writing?                               │
│  ○ Push notification  ○ SMS  ○ Email subject         │
│  ○ Email body  ○ WhatsApp message  ○ In-app message  │
│                                                      │
│  Use case:                                           │
│  [Abandoned cart recovery ▼]                         │
│                                                      │
│  Tone:                                               │
│  ○ Professional  ● Friendly  ○ Urgent  ○ Casual      │
│                                                      │
│  Include:                                            │
│  [user's name, product name, discount percentage]    │
│                                                      │
│  Additional context:                                 │
│  [Free text prompt for specific requirements]        │
│                                                      │
│  [Generate 3 Variants]                               │
│                                                      │
│  ┌─────────────────────────────────────────────────┐ │
│  │ Variant A (Friendly):                           │ │
│  │ "Hey {{name}}! Your Gold Loan application is    │ │
│  │ almost done. Complete it in 2 minutes and get   │ │
│  │ {{discount}}% off processing fees!"             │ │
│  │ [Copy] [Use in Campaign] [Refine]               │ │
│  └─────────────────────────────────────────────────┘ │
│  ┌─────────────────────────────────────────────────┐ │
│  │ Variant B:                                      │ │
│  │ ...                                             │ │
│  └─────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────┘
```

Uses Claude API or Groq for generation. Rate limited per tenant (monthly quota).

### Template Generator
Generate entire in-app message layouts from a prompt:
- "Create a survey asking users about their favourite loan products"
- "Build a promotional popup for festive gold loan offers"
- Outputs HTML/JSON template that can be used in in-app messages

### Flow Generator
Generate flow structure from a goal description:
- "Build a flow that recovers abandoned loan applications over 3 days with WhatsApp and SMS"
- Outputs a flow skeleton (nodes + edges) that the user can edit in the flow builder
- This is a stretch goal — implement if time allows

### Embedded AI (Point-of-Use Integration)
In addition to the standalone section, AI buttons appear inside:
- **Push notification editor**: "Generate with AI" button next to the title/body fields
- **Email template editor**: "Generate subject line" and "Generate body" buttons
- **In-app message builder**: "Generate layout" button
- **Segment builder**: "Suggest segment" button (describe a use case, get a filter config)
- Each embedded button opens a compact inline prompt (not a full-page redirect to AI Studio)

## Intelligent Path Optimiser

### What It Does
Extension of NBA (Next Best Action) to optimise entire flow BRANCHES, not just individual nodes.

### How It Works
When a flow has multiple possible paths (e.g., Condition → Yes Branch vs No Branch), the Path Optimiser:
1. Randomly assigns users to different paths (exploration phase)
2. Tracks which path achieves the flow's goal event more often
3. Gradually shifts more traffic to the winning path (exploitation phase)
4. Continues small exploration tail to detect if conditions change

### Implementation
- Uses the same Thompson Sampling bandit as NBA, but arms = full path combinations
- Each path is identified by the sequence of branch decisions: e.g., "Yes-Yes-No" vs "Yes-No-Yes"
- State stored in Redis per flow: `path_opt:<flow_id>:<path_signature>`
- UI: toggle "AI Optimise Paths" on the flow top bar. Shows path performance comparison.

### Difference from NBA
- NBA optimises at EACH decision point independently
- Path Optimiser optimises the COMBINATION of decisions across the entire flow
- Path Optimiser is better for flows with multiple correlated conditions

## You Do NOT Touch
- The flow execution engine (Path Optimiser feeds decisions INTO the executor, doesn't modify it)
- The ML training pipeline (AI Studio uses pre-trained models or LLM APIs, not autoresearch)
- The segment builder
- The delivery service (PII tokenisation modifies what gets SENT to the delivery service)

## Quality Bar
- PII tokenisation must add <50ms to the send path (token resolution is async at Pinnacle's end)
- AI Studio copy generation must respond in <5 seconds (streaming preferred)
- AI Studio must track quota usage and show "X of Y generations used this month"
- Path Optimiser must not degrade flow execution performance (bandit computation is O(1) per decision)
- All PII-related code must have extensive logging for compliance audit trails
