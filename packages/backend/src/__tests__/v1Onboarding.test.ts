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
    returning: vi.fn().mockResolvedValue([{ id: 'proj_123', name: 'Test', domainType: 'fintech', integrationType: 'api_key' }]),
    update: vi.fn().mockReturnThis(),
    set: vi.fn().mockReturnThis(),
  },
}))

vi.mock('../db/schema.js', () => ({
  projects: { id: 'id', name: 'name', domainType: 'domain_type', integrationType: 'integration_type', shopifyAccessToken: 'shopify_access_token' },
  apiKeys: { id: 'id', projectId: 'project_id', keyPublic: 'key_public', isActive: 'is_active' },
  events: { id: 'id', projectId: 'project_id' },
  segments: { id: 'id', projectId: 'project_id' },
  customers: {},
  entities: {},
  identities: {},
}))

vi.mock('../middleware/apiKeyAuth.js', () => ({
  generateApiKeyPair: () => ({
    keyPublic: 'sk_live_test123',
    keySecret: 'ss_live_secret456',
    keySecretHash: 'hash_abc',
  }),
}))

vi.mock('../services/domainRegistry.js', () => ({
  getDomainConfig: () => ({
    domainType: 'fintech',
    fields: [],
    channels: ['email', 'sms', 'push', 'whatsapp'],
  }),
}))

import express from 'express'
import onboardingRoutes from '../routes/v1Onboarding.js'

function buildApp() {
  const app = express()
  app.use(express.json())
  app.use('/api/onboarding', onboardingRoutes)
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

describe('POST /api/onboarding/projects', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns 400 when name is missing', async () => {
    const app = buildApp()
    const res = await request(app, 'POST', '/api/onboarding/projects', {
      domain_type: 'fintech',
    })

    expect(res.status).toBe(400)
    expect((res.body as { error: string }).error).toContain('name')
  })

  it('returns 400 when domain_type is invalid', async () => {
    const app = buildApp()
    const res = await request(app, 'POST', '/api/onboarding/projects', {
      name: 'Test Project',
      domain_type: 'invalid',
    })

    expect(res.status).toBe(400)
    expect((res.body as { error: string }).error).toContain('domain_type')
  })

  it('creates fintech project with API keys', async () => {
    const { db } = await import('../db/connection.js')
    const mockDb = db as unknown as Record<string, ReturnType<typeof vi.fn>>

    // Mock project insert
    mockDb.returning = vi.fn()
      .mockResolvedValueOnce([{ id: 'proj_123', name: 'My Bank App', domainType: 'fintech', integrationType: 'api_key' }])
      // Mock segment inserts (5 fintech templates)
      .mockResolvedValueOnce([{ id: 'seg_1' }])
      .mockResolvedValueOnce([{ id: 'seg_2' }])
      .mockResolvedValueOnce([{ id: 'seg_3' }])
      .mockResolvedValueOnce([{ id: 'seg_4' }])
      .mockResolvedValueOnce([{ id: 'seg_5' }])
      // Mock API key insert
      .mockResolvedValueOnce([{ id: 'key_1' }])

    const app = buildApp()
    const res = await request(app, 'POST', '/api/onboarding/projects', {
      name: 'My Bank App',
      domain_type: 'fintech',
    })

    expect(res.status).toBe(201)
    const body = res.body as { success: boolean; data: { project: { domain_type: string }; api_keys: { key_public: string; key_secret: string }; next_step: string } }
    expect(body.success).toBe(true)
    expect(body.data.project.domain_type).toBe('fintech')
    expect(body.data.api_keys.key_public).toBe('sk_live_test123')
    expect(body.data.api_keys.key_secret).toBe('ss_live_secret456')
    expect(body.data.next_step).toBe('send_test_event')
  })

  it('creates ecommerce project with Shopify install URL', async () => {
    const { db } = await import('../db/connection.js')
    const mockDb = db as unknown as Record<string, ReturnType<typeof vi.fn>>

    mockDb.returning = vi.fn()
      .mockResolvedValueOnce([{ id: 'proj_456', name: 'My Store', domainType: 'ecommerce', integrationType: 'shopify' }])
      // 3 ecommerce segment templates
      .mockResolvedValueOnce([{ id: 'seg_1' }])
      .mockResolvedValueOnce([{ id: 'seg_2' }])
      .mockResolvedValueOnce([{ id: 'seg_3' }])

    const app = buildApp()
    const res = await request(app, 'POST', '/api/onboarding/projects', {
      name: 'My Store',
      domain_type: 'ecommerce',
    })

    expect(res.status).toBe(201)
    const body = res.body as { success: boolean; data: { project: { integration_type: string }; shopify: { install_url: unknown }; next_step: string } }
    expect(body.success).toBe(true)
    expect(body.data.project.integration_type).toBe('shopify')
    expect(body.data.next_step).toBe('connect_shopify')
  })
})

describe('POST /api/onboarding/projects/:id/test-event', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns 404 for non-existent project', async () => {
    const { db } = await import('../db/connection.js')
    const mockDb = db as unknown as Record<string, ReturnType<typeof vi.fn>>
    mockDb.limit = vi.fn().mockResolvedValueOnce([])

    const app = buildApp()
    const res = await request(app, 'POST', '/api/onboarding/projects/nonexistent/test-event', {})

    expect(res.status).toBe(404)
  })

  it('creates test event for valid project', async () => {
    const { db } = await import('../db/connection.js')
    const mockDb = db as unknown as Record<string, ReturnType<typeof vi.fn>>

    // Mock project lookup
    mockDb.limit = vi.fn().mockResolvedValueOnce([{ id: 'proj_123', domainType: 'fintech' }])
    // Mock event insert
    mockDb.returning = vi.fn().mockResolvedValueOnce([{ id: 'evt_test_1' }])

    const app = buildApp()
    const res = await request(app, 'POST', '/api/onboarding/projects/proj_123/test-event', {})

    expect(res.status).toBe(201)
    const body = res.body as { success: boolean; data: { event_id: string; message: string } }
    expect(body.success).toBe(true)
    expect(body.data.event_id).toBe('evt_test_1')
  })
})
