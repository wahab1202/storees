# Integrations — Google Gemini (AI)

> **Provider**: Google Gemini 2.0 Flash via Google AI Studio
> **API Key**: `GEMINI_API_KEY` environment variable
> **Endpoint**: `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent`
> **Cost**: Free tier (15 RPM, 1M tokens/day, 1500 req/day)

---

## Setup

### Get API Key
1. Visit https://aistudio.google.com/apikey
2. Click "Create API Key" — no credit card required
3. Add to `packages/backend/.env`:
   ```
   GEMINI_API_KEY=AIza...
   ```

### Free Tier Limits
| Limit | Value |
|-------|-------|
| Requests per minute | 15 |
| Tokens per day | 1,000,000 |
| Requests per day | 1,500 |
| Max input tokens | 1,048,576 |
| Max output tokens | 8,192 |

---

## API Usage

### Raw REST Call (No SDK)

No `@google/generative-ai` package needed. Use native `fetch`:

```typescript
const GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent'

async function callGemini(prompt: string, systemPrompt: string): Promise<unknown> {
  const response = await fetch(`${GEMINI_URL}?key=${process.env.GEMINI_API_KEY}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      system_instruction: {
        parts: [{ text: systemPrompt }],
      },
      contents: [
        { role: 'user', parts: [{ text: prompt }] },
      ],
      generationConfig: {
        responseMimeType: 'application/json',
        temperature: 0.1,  // low creativity — we want deterministic JSON
        maxOutputTokens: 1024,
      },
    }),
  })

  if (!response.ok) {
    const err = await response.text()
    throw new Error(`Gemini API error: ${response.status} — ${err}`)
  }

  const data = await response.json()
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text
  if (!text) throw new Error('Empty response from Gemini')

  return JSON.parse(text)
}
```

### Structured JSON Output

Gemini supports `responseMimeType: "application/json"` which guarantees the output is valid JSON. Combined with a `responseSchema`, it constrains output to a specific shape:

```typescript
generationConfig: {
  responseMimeType: 'application/json',
  responseSchema: {
    type: 'object',
    properties: {
      logic: { type: 'string', enum: ['AND', 'OR'] },
      rules: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            field: { type: 'string' },
            operator: { type: 'string' },
            value: {},
          },
          required: ['field', 'operator', 'value'],
        },
      },
    },
    required: ['logic', 'rules'],
  },
}
```

---

## System Prompt Template

The system prompt for segment AI includes:

1. **Role definition** — "You convert natural language customer segment descriptions into FilterConfig JSON"
2. **Schema definition** — Full FilterConfig type with field names, types, and valid operators
3. **Money convention** — "All monetary values are in paise (smallest currency unit). ₹5000 = 500000"
4. **Few-shot examples** — 5-10 examples covering multiple languages and filter patterns
5. **Instructions** — "Output ONLY the FilterConfig JSON. Do not include explanations."

See `docs/domains/ai/SEGMENT_AI.md` for full few-shot examples and field mappings.

---

## Conversational Context

For follow-up messages that modify existing filters, send the conversation history:

```typescript
contents: [
  { role: 'user', parts: [{ text: 'customers who spent over 5000' }] },
  { role: 'model', parts: [{ text: '{"logic":"AND","rules":[...]}' }] },
  { role: 'user', parts: [{ text: 'also add only from Chennai' }] },
],
```

Gemini will output an updated FilterConfig that includes both the original and new rules.

---

## Error Handling

| Error | HTTP Status | Action |
|-------|-------------|--------|
| Missing API key | — | Hide AI panel entirely, log warning at startup |
| Rate limited (429) | 429 | Return user-friendly "AI busy" message, no retry |
| Invalid JSON output | — | Retry once with stricter prompt, then return error |
| Network failure | — | Return "AI unavailable" message |
| Empty/null response | — | Return "Couldn't understand, try rephrasing" |

---

## Monitoring

Log all AI requests for debugging:
```typescript
console.log(`[AI] Segment query: "${input}" → ${rules.length} rules, ${Date.now() - start}ms`)
```

Track in application:
- Total AI queries per project
- Average response time
- Error rate
- Most common field mappings
