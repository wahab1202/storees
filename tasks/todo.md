# AI WhatsApp Chatbot (Bitespeed roadmap — Phase 1)

Auto-respond to inbound WhatsApp: FAQs, order tracking, product recommendations,
human handoff. Composes existing inbound capture + recommendations + /ai LLM stack.

## Architecture
- Inbound hook: `persistInboundMessages` (after persist, matched customer, text content).
- Replies are SESSION messages (24h customer-service window) — free-form text, no template.
- Outbound: add `sendText` capability to providers (Meta ✓ via Cloud API; others later).
  Provider without sendText → engine hands off to a human instead of failing.
- Per-project config under `settings.channels.whatsapp.chatbot`.

## Backend
- [ ] Migration + schema: `whatsapp_conversations` (project, customer, phone, status
      bot|human|closed, bot_turns, last_inbound_at, last_bot_at, handoff_reason).
- [ ] `ChannelProvider.sendText?(toPhone, text, config)` + metaWhatsappProvider.sendText
      + `getProviderCapabilities` exposes it.
- [ ] `sendWhatsappSessionText(projectId, toPhone, text)` helper (resolves provider).
- [ ] `whatsappChatbotService.ts`:
  - [ ] read config (enabled, greeting, handoffKeywords, faqs[])
  - [ ] guard: enabled, text content, not STOP/START, conversation not 'human', turn cap
  - [ ] classify intent + draft reply via llmService (strict JSON: intent, reply, needsHuman, confidence)
  - [ ] order_status → look up customer's recent orders
  - [ ] product intent → recommendForCustomer → format as text
  - [ ] handoff → set status 'human', send handoff msg, emit event, stop
  - [ ] send reply, bump turns, log bot message + emit `whatsapp_bot_reply` event
- [ ] Wire into `persistInboundMessages` (fire-and-forget, guarded).
- [ ] Tests: engine (mock LLM + provider): intent routing, handoff, turn cap, disabled no-op.

## Config / UI (follow-on)
- [ ] Settings → WhatsApp: chatbot toggle + greeting + FAQs + handoff keywords.

## Verify
- [ ] typecheck both packages; unit tests; full `npm run build`
