import { Router, Response } from 'express'
import { eq, and, desc, sql, count } from 'drizzle-orm'
import { db } from '../db/connection.js'
import { whatsappConversations, whatsappInboundMessages, whatsappOutboundMessages, customers, adminUsers } from '../db/schema.js'
import { requireProjectId } from '../middleware/projectId.js'
import type { AuthenticatedRequest } from '../middleware/requireAuth.js'
import { sendWhatsappSessionText, recordOutbound } from '../services/whatsappChatbotService.js'
import { clampPageSize, calcTotalPages } from '@storees/shared'

const router = Router()
router.use(requireProjectId)

const VALID_STATUS = ['bot', 'human', 'closed'] as const
type ConvoStatus = (typeof VALID_STATUS)[number]

// GET /api/whatsapp/inbox/conversations?status=&page=&pageSize=
router.get('/conversations', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const projectId = req.projectId!
    const page = Math.max(1, Number(req.query.page) || 1)
    const pageSize = clampPageSize(Number(req.query.pageSize) || 25)
    const status = req.query.status as string | undefined
    const conds = [eq(whatsappConversations.projectId, projectId)]
    if (status && VALID_STATUS.includes(status as ConvoStatus)) {
      conds.push(eq(whatsappConversations.status, status))
    }
    const where = and(...conds)

    const [{ total }] = await db.select({ total: count() }).from(whatsappConversations).where(where)
    // Conversations needing a human, for the nav badge — independent of the filter.
    const [{ attention }] = await db
      .select({ attention: count() })
      .from(whatsappConversations)
      .where(and(eq(whatsappConversations.projectId, projectId), eq(whatsappConversations.status, 'human')))

    const rows = await db
      .select({
        id: whatsappConversations.id,
        phone: whatsappConversations.phone,
        status: whatsappConversations.status,
        botTurns: whatsappConversations.botTurns,
        handoffReason: whatsappConversations.handoffReason,
        lastInboundAt: whatsappConversations.lastInboundAt,
        lastBotAt: whatsappConversations.lastBotAt,
        updatedAt: whatsappConversations.updatedAt,
        customerId: whatsappConversations.customerId,
        customerName: customers.name,
        lastMessage: sql<string | null>`(
          SELECT content FROM whatsapp_inbound_messages m
          WHERE m.project_id = ${projectId} AND m.from_phone = ${whatsappConversations.phone}
          ORDER BY m.received_at DESC LIMIT 1
        )`,
      })
      .from(whatsappConversations)
      .leftJoin(customers, eq(whatsappConversations.customerId, customers.id))
      .where(where)
      .orderBy(desc(whatsappConversations.updatedAt))
      .limit(pageSize)
      .offset((page - 1) * pageSize)

    res.json({
      success: true,
      data: rows,
      attention: Number(attention),
      pagination: { page, pageSize, total: Number(total), totalPages: calcTotalPages(Number(total), pageSize) },
    })
  } catch (err) {
    console.error('GET /whatsapp/inbox/conversations error:', err)
    res.status(500).json({ success: false, error: 'Failed to load conversations' })
  }
})

// GET /api/whatsapp/inbox/conversations/:id/messages — unified thread
router.get('/conversations/:id/messages', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const projectId = req.projectId!
    const [convo] = await db
      .select({ phone: whatsappConversations.phone })
      .from(whatsappConversations)
      .where(and(eq(whatsappConversations.id, req.params.id as string), eq(whatsappConversations.projectId, projectId)))
      .limit(1)
    if (!convo) return res.status(404).json({ success: false, error: 'Conversation not found' })

    const [inbound, outbound] = await Promise.all([
      db.select({ content: whatsappInboundMessages.content, at: whatsappInboundMessages.receivedAt, mediaType: whatsappInboundMessages.mediaType })
        .from(whatsappInboundMessages)
        .where(and(eq(whatsappInboundMessages.projectId, projectId), eq(whatsappInboundMessages.fromPhone, convo.phone)))
        .orderBy(desc(whatsappInboundMessages.receivedAt)).limit(100),
      db.select({ content: whatsappOutboundMessages.content, at: whatsappOutboundMessages.createdAt, sentBy: whatsappOutboundMessages.sentBy, agentName: adminUsers.name })
        .from(whatsappOutboundMessages)
        .leftJoin(adminUsers, eq(whatsappOutboundMessages.agentUserId, adminUsers.id))
        .where(and(eq(whatsappOutboundMessages.projectId, projectId), eq(whatsappOutboundMessages.phone, convo.phone)))
        .orderBy(desc(whatsappOutboundMessages.createdAt)).limit(100),
    ])

    const thread = [
      ...inbound.map(m => ({ direction: 'in' as const, content: m.content, at: m.at, mediaType: m.mediaType })),
      ...outbound.map(m => ({ direction: 'out' as const, content: m.content, at: m.at, sentBy: m.sentBy, agentName: m.agentName })),
    ].sort((a, b) => new Date(a.at as unknown as string).getTime() - new Date(b.at as unknown as string).getTime())

    res.json({ success: true, data: thread })
  } catch (err) {
    console.error('GET /whatsapp/inbox/messages error:', err)
    res.status(500).json({ success: false, error: 'Failed to load thread' })
  }
})

// POST /api/whatsapp/inbox/conversations/:id/reply — agent reply
router.post('/conversations/:id/reply', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const projectId = req.projectId!
    const text = typeof req.body?.text === 'string' ? req.body.text.trim() : ''
    if (!text) return res.status(400).json({ success: false, error: 'Message text is required' })

    const [convo] = await db
      .select({ phone: whatsappConversations.phone, customerId: whatsappConversations.customerId })
      .from(whatsappConversations)
      .where(and(eq(whatsappConversations.id, req.params.id as string), eq(whatsappConversations.projectId, projectId)))
      .limit(1)
    if (!convo) return res.status(404).json({ success: false, error: 'Conversation not found' })

    const sent = await sendWhatsappSessionText(projectId, convo.phone, text)
    if (!sent.ok) {
      const msg = sent.reason === 'unsupported'
        ? 'This WhatsApp provider does not support free-form replies yet.'
        : `Could not send (${sent.reason ?? 'failed'})`
      return res.status(400).json({ success: false, error: msg })
    }

    await recordOutbound({ projectId, customerId: convo.customerId, phone: convo.phone, content: text, sentBy: 'agent', agentUserId: req.adminUser!.userId, providerMessageId: sent.messageId })
    // A human replied — keep the thread in human mode so the bot stays out.
    await db.update(whatsappConversations).set({ status: 'human', lastBotAt: new Date(), updatedAt: new Date() }).where(eq(whatsappConversations.id, req.params.id as string))

    res.json({ success: true, data: { sent: true } })
  } catch (err) {
    console.error('POST /whatsapp/inbox/reply error:', err)
    res.status(500).json({ success: false, error: 'Failed to send reply' })
  }
})

// POST /api/whatsapp/inbox/conversations/:id/status — take over / close / return to bot
router.post('/conversations/:id/status', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const projectId = req.projectId!
    const status = req.body?.status as string
    if (!VALID_STATUS.includes(status as ConvoStatus)) {
      return res.status(400).json({ success: false, error: `status must be one of ${VALID_STATUS.join(', ')}` })
    }
    const patch: Record<string, unknown> = { status, updatedAt: new Date() }
    if (status === 'bot') { patch.botTurns = 0; patch.handoffReason = null } // reopen to the bot

    const result = await db.update(whatsappConversations)
      .set(patch)
      .where(and(eq(whatsappConversations.id, req.params.id as string), eq(whatsappConversations.projectId, projectId)))
      .returning({ id: whatsappConversations.id })
    if (result.length === 0) return res.status(404).json({ success: false, error: 'Conversation not found' })

    res.json({ success: true, data: { status } })
  } catch (err) {
    console.error('POST /whatsapp/inbox/status error:', err)
    res.status(500).json({ success: false, error: 'Failed to update conversation' })
  }
})

export default router
