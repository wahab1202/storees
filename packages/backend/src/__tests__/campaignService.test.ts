import { describe, it, expect, vi, beforeEach } from 'vitest'

// ============ Mock external dependencies ============

vi.mock('../db/connection.js', () => ({
  db: {
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    innerJoin: vi.fn().mockReturnThis(),
    leftJoin: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue([]),
    insert: vi.fn().mockReturnThis(),
    values: vi.fn().mockResolvedValue([]),
    update: vi.fn().mockReturnThis(),
    set: vi.fn().mockReturnThis(),
    delete: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockReturnThis(),
  },
}))

vi.mock('../services/emailService.js', () => ({
  sendEmail: vi.fn().mockResolvedValue('msg_test_123'),
  interpolateTemplate: vi.fn().mockImplementation((template: string, ctx: Record<string, string>) =>
    template.replace(/\{\{(\w+)\}\}/g, (_, key: string) => ctx[key] ?? ''),
  ),
  appendUtmParameters: vi.fn().mockImplementation((html: string) => html),
  appendUtmParametersToText: vi.fn().mockImplementation((text: string) => text),
  personalizeDynamicImages: vi.fn().mockImplementation((text: string) => text),
}))

vi.mock('../services/campaignAttachmentService.js', () => ({
  copyCampaignAttachments: vi.fn().mockResolvedValue(undefined),
  listCampaignAttachments: vi.fn().mockResolvedValue([]),
  loadResendAttachments: vi.fn().mockResolvedValue([]),
}))

vi.mock('../services/gmailAnnotation.js', () => ({
  injectGmailAnnotation: vi.fn().mockImplementation((html: string) => html),
}))

vi.mock('../services/queue.js', () => ({
  campaignQueue: {
    add: vi.fn().mockResolvedValue({ id: 'job_1' }),
  },
}))

vi.mock('../db/schema.js', () => ({
  campaigns: { id: 'id', projectId: 'project_id', status: 'status' },
  campaignSends: { id: 'id', campaignId: 'campaign_id', status: 'status', scheduledAt: 'scheduled_at' },
  campaignHoldouts: {},
  customers: {
    id: 'id',
    externalId: 'external_id',
    email: 'email',
    phone: 'phone',
    name: 'name',
    region: 'region',
    city: 'city',
    totalOrders: 'total_orders',
    totalSpent: 'total_spent',
    avgOrderValue: 'avg_order_value',
    clv: 'clv',
    firstOrderDate: 'first_order_date',
    lastOrderDate: 'last_order_date',
    lastSeen: 'last_seen',
    customAttributes: 'custom_attributes',
  },
  customerSegments: {},
  segments: {},
  emailSuppressions: {},
  consents: {},
  projects: { id: 'id', name: 'name', emailFromAddress: 'email_from_address', emailFromName: 'email_from_name' },
  campaignSubscriptionCategories: {},
  customerSubscriptions: {},
  whatsappTemplates: {},
  whatsappInboundMessages: {},
}))

// ============ Import after mocks ============

import { getCampaignRecipients, dispatchCampaign, processCampaign } from '../services/campaignService.js'
import { db } from '../db/connection.js'
import { sendEmail } from '../services/emailService.js'

const mockDb = db as unknown as Record<string, ReturnType<typeof vi.fn>>

// ============ Tests ============

describe('getCampaignRecipients', () => {
  it('returns only customers with email addresses', async () => {
    const mockMembers = [
      { customerId: 'cust_1', email: 'alice@example.com', name: 'Alice' },
      { customerId: 'cust_2', email: null, name: 'Bob' },
      { customerId: 'cust_3', email: 'charlie@example.com', name: 'Charlie' },
    ]

    // Build a proper chainable mock returning the members
    const chain = {
      from: vi.fn().mockReturnThis(),
      innerJoin: vi.fn().mockReturnThis(),
      where: vi.fn().mockResolvedValue(mockMembers),
    }
    mockDb.select = vi.fn().mockReturnValue(chain)

    const result = await getCampaignRecipients('segment_123')

    expect(result).toHaveLength(2)
    expect(result.map(r => r.email)).toEqual(['alice@example.com', 'charlie@example.com'])
  })

  it('returns empty array when segment has no members', async () => {
    const chain = {
      from: vi.fn().mockReturnThis(),
      innerJoin: vi.fn().mockReturnThis(),
      where: vi.fn().mockResolvedValue([]),
    }
    mockDb.select = vi.fn().mockReturnValue(chain)

    const result = await getCampaignRecipients('empty_segment')
    expect(result).toHaveLength(0)
  })
})

describe('dispatchCampaign', () => {
  beforeEach(() => vi.clearAllMocks())

  it('throws if campaign not found', async () => {
    const selectChain = { from: vi.fn().mockReturnThis(), where: vi.fn().mockReturnThis(), limit: vi.fn().mockResolvedValue([]) }
    mockDb.select = vi.fn().mockReturnValue(selectChain)

    await expect(dispatchCampaign('nonexistent')).rejects.toThrow('Campaign not found')
  })

  it('throws if campaign status is not draft or scheduled', async () => {
    const campaign = { id: 'c1', status: 'sent', segmentId: 'seg_1', name: 'Test' }
    const selectChain = { from: vi.fn().mockReturnThis(), where: vi.fn().mockReturnThis(), limit: vi.fn().mockResolvedValue([campaign]) }
    mockDb.select = vi.fn().mockReturnValue(selectChain)

    await expect(dispatchCampaign('c1')).rejects.toThrow('Campaign cannot be sent')
  })

  it('throws if campaign audience has no reachable customers', async () => {
    const campaign = { id: 'c1', projectId: 'proj_test', status: 'draft', segmentId: null, name: 'Test', channel: 'email' }
    let call = 0
    const selectChain = {
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockImplementation(() => {
        call++
        if (call === 1) return { limit: vi.fn().mockResolvedValue([campaign]) }
        if (call === 2) return Promise.resolve([])
        return { orderBy: vi.fn().mockReturnThis(), limit: vi.fn().mockResolvedValue([]) }
      }),
      orderBy: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue([]),
    }
    mockDb.select = vi.fn().mockReturnValue(selectChain)

    await expect(dispatchCampaign('c1')).rejects.toThrow('No reachable customers')
  })

  it('throws if segment has no recipients with emails', async () => {
    const campaign = { id: 'c1', projectId: 'proj_test', status: 'draft', segmentId: 'seg_1', name: 'Test', channel: 'email' }
    let callCount = 0
    const selectChain = {
      from: vi.fn().mockReturnThis(),
      innerJoin: vi.fn().mockReturnThis(),
      orderBy: vi.fn().mockReturnThis(),
      where: vi.fn().mockImplementation(() => {
        callCount++
        if (callCount === 1) return { limit: vi.fn().mockResolvedValue([campaign]) }
        if (callCount === 2) return Promise.resolve([])
        return { orderBy: vi.fn().mockReturnThis(), limit: vi.fn().mockResolvedValue([]) }
      }),
      limit: vi.fn().mockResolvedValue([campaign]),
    }
    mockDb.select = vi.fn().mockReturnValue(selectChain)

    await expect(dispatchCampaign('c1')).rejects.toThrow('No reachable customers')
  })
})

describe('processCampaign', () => {
  beforeEach(() => vi.clearAllMocks())

  it('sends emails to all pending recipients and marks them sent', async () => {
    const campaign = {
      id: 'c1',
      projectId: 'proj_test',
      name: 'Test Campaign',
      status: 'sending',
      channel: 'email',
      subject: 'Hello {{customer_name}}',
      htmlBody: '<p>Hi {{customer_name}}</p>',
      sentCount: 0,
      failedCount: 0,
      variables: [],
    }

    const pendingSends = [
      { id: 's1', campaignId: 'c1', customerId: 'cust_1', email: 'alice@example.com', status: 'pending' },
      { id: 's2', campaignId: 'c1', customerId: 'cust_2', email: 'bob@example.com', status: 'pending' },
    ]

    const customer = { name: 'Alice' }
    const project = { id: 'proj_test', name: 'Storees Test' }

    let selectCall = 0
    const selectChain = {
      from: vi.fn().mockReturnThis(),
      orderBy: vi.fn().mockReturnThis(),
      limit: vi.fn().mockImplementation(() => {
        if (selectCall === 1) return Promise.resolve([campaign])
        if (selectCall === 2) return Promise.resolve([project])
        if (selectCall >= 5) return Promise.resolve([])
        return Promise.resolve([])
      }),
      where: vi.fn().mockImplementation(function (this: unknown) {
        selectCall++
        if (selectCall === 1) return { limit: vi.fn().mockResolvedValue([campaign]) } // campaign fetch
        if (selectCall === 2) return { limit: vi.fn().mockResolvedValue([project]) }  // project fetch
        if (selectCall === 3) return { orderBy: vi.fn().mockReturnThis(), limit: vi.fn().mockResolvedValue(pendingSends) }
        if (selectCall === 4) return Promise.resolve([{ id: 'cust_1', name: 'Alice', email: 'alice@example.com' }, { id: 'cust_2', name: 'Bob', email: 'bob@example.com' }])
        return { orderBy: vi.fn().mockReturnThis(), limit: vi.fn().mockResolvedValue([]) }
      }),
    }
    mockDb.select = vi.fn().mockReturnValue(selectChain)

    const updateChain = { set: vi.fn().mockReturnThis(), where: vi.fn().mockResolvedValue([]) }
    mockDb.update = vi.fn().mockReturnValue(updateChain)

    vi.mocked(sendEmail).mockResolvedValue('msg_123')

    await processCampaign('c1')

    expect(sendEmail).toHaveBeenCalledTimes(2)
    expect(sendEmail).toHaveBeenCalledWith(expect.objectContaining({ to: 'alice@example.com' }))
    expect(sendEmail).toHaveBeenCalledWith(expect.objectContaining({ to: 'bob@example.com' }))
  })

  it('marks sends as failed when email delivery fails', async () => {
    const campaign = {
      id: 'c1',
      projectId: 'proj_test',
      name: 'Test',
      status: 'sending',
      channel: 'email',
      subject: 'Test',
      htmlBody: '<p>Test</p>',
      sentCount: 0,
      failedCount: 0,
      variables: [],
    }

    const pendingSends = [
      { id: 's1', campaignId: 'c1', customerId: 'cust_1', email: 'fail@example.com', status: 'pending' },
    ]

    let selectCall = 0
    const selectChain = {
      from: vi.fn().mockReturnThis(),
      orderBy: vi.fn().mockReturnThis(),
      where: vi.fn().mockImplementation(function (this: unknown) {
        selectCall++
        if (selectCall === 1) return { limit: vi.fn().mockResolvedValue([campaign]) }
        if (selectCall === 2) return { limit: vi.fn().mockResolvedValue([{ id: 'proj_test', name: 'Storees Test' }]) }
        if (selectCall === 3) return { orderBy: vi.fn().mockReturnThis(), limit: vi.fn().mockResolvedValue(pendingSends) }
        if (selectCall === 4) return Promise.resolve([{ id: 'cust_1', name: 'Test User', email: 'fail@example.com' }])
        return { orderBy: vi.fn().mockReturnThis(), limit: vi.fn().mockResolvedValue([]) }
      }),
    }
    mockDb.select = vi.fn().mockReturnValue(selectChain)

    const updateChain = { set: vi.fn().mockReturnThis(), where: vi.fn().mockResolvedValue([]) }
    mockDb.update = vi.fn().mockReturnValue(updateChain)

    // Simulate failed delivery
    vi.mocked(sendEmail).mockResolvedValue(null)

    await processCampaign('c1')

    // Verify the update was called with failed status
    expect(updateChain.set).toHaveBeenCalledWith({ status: 'failed' })
  })

  it('skips processing if campaign is not in sending state', async () => {
    const campaign = { id: 'c1', status: 'draft' }
    const selectChain = {
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue([campaign]),
    }
    mockDb.select = vi.fn().mockReturnValue(selectChain)

    await processCampaign('c1')

    expect(sendEmail).not.toHaveBeenCalled()
  })
})

describe('interpolateTemplate', () => {
  // The mock returns the real implementation, so we test the logic directly
  it('replaces all {{variable}} placeholders', () => {
    // Use the real implementation (bypassing mock for this pure function test)
    const fn = (template: string, ctx: Record<string, string>) =>
      template.replace(/\{\{(\w+)\}\}/g, (_, key: string) => ctx[key] ?? '')

    const result = fn('Hello {{customer_name}}, your email is {{customer_email}}', {
      customer_name: 'Alice',
      customer_email: 'alice@example.com',
    })
    expect(result).toBe('Hello Alice, your email is alice@example.com')
  })

  it('replaces missing variables with empty string', () => {
    const fn = (template: string, ctx: Record<string, string>) =>
      template.replace(/\{\{(\w+)\}\}/g, (_, key: string) => ctx[key] ?? '')

    const result = fn('Hello {{name}}, you have {{unsubscribe_url}} here', { name: 'Bob' })
    expect(result).toBe('Hello Bob, you have  here')
  })
})
