import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock DB
vi.mock('../db/connection.js', () => ({
  db: {
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue([]),
    insert: vi.fn().mockReturnThis(),
    values: vi.fn().mockReturnThis(),
    returning: vi.fn().mockResolvedValue([{ id: 'evt_123' }]),
    update: vi.fn().mockReturnThis(),
    set: vi.fn().mockReturnThis(),
    onConflictDoNothing: vi.fn().mockResolvedValue(undefined),
  },
}))

vi.mock('../db/schema.js', () => ({
  events: { id: 'id', projectId: 'project_id', idempotencyKey: 'idempotency_key' },
  customers: { id: 'id', projectId: 'project_id', externalId: 'external_id', email: 'email', phone: 'phone' },
  entities: { id: 'id', projectId: 'project_id', entityType: 'entity_type', externalId: 'external_id' },
  identities: {},
  apiKeys: { id: 'id', keyPublic: 'key_public', isActive: 'is_active', projectId: 'project_id' },
  projects: {},
}))

vi.mock('../middleware/apiKeyAuth.js', () => ({
  requireApiKeyAuth: () => (req: Record<string, unknown>, _res: unknown, next: () => void) => {
    req.projectId = 'proj_test'
    req.apiKeyId = 'key_test'
    req.apiKeyPermissions = ['read', 'write']
    next()
  },
}))

vi.mock('../middleware/dataMasking.js', () => ({
  dataMaskingMiddleware: () => (_req: unknown, _res: unknown, next: () => void) => next(),
}))

import express from 'express'
import v1EventRoutes from '../routes/v1Events.js'

function buildApp() {
  const app = express()
  app.use(express.json())
  app.use('/api/v1', v1EventRoutes)
  return app
}

async function request(
  app: ReturnType<typeof buildApp>,
  method: string,
  path: string,
  body?: unknown,
) {
  const { createServer, request: httpRequest } = await import('http')

  return new Promise<{ status: number; body: unknown }>((resolve) => {
    const server = createServer(app)
    server.listen(0, '127.0.0.1', () => {
      const port = (server.address() as { port: number }).port
      const req = httpRequest({
        hostname: '127.0.0.1',
        port,
        path,
        method,
        headers: { 'Content-Type': 'application/json' },
      }, (res) => {
        let data = ''
        res.on('data', (chunk) => (data += chunk))
        res.on('end', () => {
          server.close()
          resolve({ status: res.statusCode!, body: JSON.parse(data) })
        })
      })
      if (body) req.write(JSON.stringify(body))
      req.end()
    })
  })
}

describe('POST /api/v1/events', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns 400 when event_name is missing', async () => {
    const app = buildApp()
    const res = await request(app, 'POST', '/api/v1/events', {
      customer_id: 'CUST_1',
    })

    expect(res.status).toBe(400)
    expect((res.body as { error: string }).error).toContain('event_name')
  })

  it('returns 400 when no customer identifier provided', async () => {
    const app = buildApp()
    const res = await request(app, 'POST', '/api/v1/events', {
      event_name: 'transaction_completed',
    })

    expect(res.status).toBe(400)
    expect((res.body as { error: string }).error).toContain('customer_id')
  })

  it('returns 400 when timestamp is too old', async () => {
    const app = buildApp()
    const oldDate = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString()
    const res = await request(app, 'POST', '/api/v1/events', {
      event_name: 'transaction_completed',
      customer_id: 'CUST_1',
      timestamp: oldDate,
    })

    expect(res.status).toBe(400)
    expect((res.body as { error: string }).error).toContain('7 days')
  })

  it('creates event with valid payload', async () => {
    const { db } = await import('../db/connection.js')
    const mockDb = db as unknown as Record<string, ReturnType<typeof vi.fn>>

    // Mock customer lookup returning existing customer
    mockDb.limit = vi.fn().mockResolvedValueOnce([{ id: 'cust_existing' }])

    // Mock event insert
    const insertChain = {
      values: vi.fn().mockReturnThis(),
      returning: vi.fn().mockResolvedValue([{ id: 'evt_new' }]),
    }
    mockDb.insert = vi.fn().mockReturnValue(insertChain)
    mockDb.update = vi.fn().mockReturnValue({ set: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue(undefined) }) })

    const app = buildApp()
    const res = await request(app, 'POST', '/api/v1/events', {
      event_name: 'transaction_completed',
      customer_id: 'CUST_123',
      properties: {
        type: 'debit',
        channel: 'upi',
        amount: 250000,
        currency: 'INR',
      },
    })

    expect(res.status).toBe(201)
    expect((res.body as { success: boolean }).success).toBe(true)
  })
})

describe('POST /api/v1/events/batch', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns 400 when events array is empty', async () => {
    const app = buildApp()
    const res = await request(app, 'POST', '/api/v1/events/batch', {
      events: [],
    })

    expect(res.status).toBe(400)
    expect((res.body as { error: string }).error).toContain('events array')
  })

  it('returns 400 when batch exceeds 1000', async () => {
    const app = buildApp()
    const events = Array.from({ length: 1001 }, (_, i) => ({
      event_name: 'test',
      customer_id: `CUST_${i}`,
    }))

    const res = await request(app, 'POST', '/api/v1/events/batch', { events })

    expect(res.status).toBe(400)
    expect((res.body as { error: string }).error).toContain('1000')
  })
})

describe('POST /api/v1/customers', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns 400 when customer_id is missing', async () => {
    const app = buildApp()
    const res = await request(app, 'POST', '/api/v1/customers', {
      attributes: { email: 'test@test.com' },
    })

    expect(res.status).toBe(400)
    expect((res.body as { error: string }).error).toContain('customer_id')
  })
})
