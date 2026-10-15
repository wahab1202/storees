# WhatsApp Support Inbox (agent inbox for handoffs)

Make chatbot handoffs actionable: agents see conversations, read the thread, and reply.

## Backend
- [ ] Migration + schema: `whatsapp_outbound_messages` (project, customer, phone,
      content, sent_by bot|agent, agent_user_id, provider_message_id, created_at).
- [ ] Chatbot writes bot replies + handoff messages to the outbound store (in
      addition to events) so the thread is complete.
- [ ] `routes/whatsappInbox.ts` (`/api/whatsapp/inbox`):
  - [ ] GET /conversations?status= — list (customer, last msg, status, last activity) + attention count
  - [ ] GET /conversations/:id/messages — unified thread (inbound ∪ outbound, time-ordered)
  - [ ] POST /conversations/:id/reply — agent sends session text, stores outbound (agent), keeps 'human'
  - [ ] POST /conversations/:id/status — take over (bot→human) / close / reopen
- [ ] Mount in index.ts.

## Frontend
- [ ] hooks: useInboxConversations, useInboxThread, useSendInboxReply, useSetConversationStatus
- [ ] `/inbox` page — list + thread + composer, status filter, take-over/close actions
- [ ] Sidebar nav "Inbox" (+ attention badge)

## Verify
- [ ] typecheck both; full npm run build; push both branches
