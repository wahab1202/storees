import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock DB + services before router loads
vi.mock('../db/connection.js', () => ({
  db: {
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue([]),
    insert: vi.fn().mockReturnThis(),
    values: vi.fn().mockReturnThis(),
    returning: vi.fn().mockResolvedValue([]),
    update: vi.fn().mockReturnThis(),
    set: vi.fn().mockReturnThis(),
    delete: vi.fn().mockReturnThis(),
    leftJoin: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockReturnThis(),
  },
}))

vi.mock('../services/campaignService.js', () => ({
  listCampaigns: vi.fn(),
  getCampaignWithSegment: vi.fn(),
  dispatchCampaign: vi.fn(),
}))

vi.mock('../db/schema.js', () => ({
  campaigns: {},
  campaignSends: {},
}))

import express from 'express'
import campaignRoutes from '../routes/campaigns.js'
import { listCampaigns, getCampaignWithSegment, dispatchCampaign } from '../services/campaignService.js'

// Build test app — inject projectId via middleware
function buildApp() {
  const app = express()
  app.use(express.json())
  app.use((req, _res, next) => {
    ;(req as unknown as { projectId: string }).projectId = 'proj_test'
    next()
  })
  app.use('/api/campaigns', campaignRoutes)
  return app
}

// Simple HTTP helper without supertest (avoids extra dep)
async function request(
  app: ReturnType<typeof buildApp>,
  method: string,
  path: string,
  body?: unknown,
) {
  const { createServer } = await import('http')
  const { default: http } = await import('http')

  return new Promise<{ status: number; body: unknown }>((resolve) => {
    const server = createServer(app)
    server.listen(0, '127.0.0.1', () => {
      const port = (server.address() as { port: number }).port
      const options = {
        hostname: '127.0.0.1',
        port,
        path: path + '?projectId=proj_test',
        method,
        headers: { 'Content-Type': 'application/json' },
      }

      const req = http.request(options, (res) => {
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

describe('GET /api/campaigns', () => {
  it('returns a list of campaigns', async () => {
    const mockCampaigns = [
      { id: 'c1', name: 'Test Campaign', status: 'draft', subject: 'Hello', segmentName: 'VIP' },
    ]
    vi.mocked(listCampaigns).mockResolvedValue(mockCampaigns as never)

    const app = buildApp()
    const res = await request(app, 'GET', '/api/campaigns')

    expect(res.status).toBe(200)
    expect((res.body as { success: boolean }).success).toBe(true)
    expect((res.body as { data: unknown[] }).data).toHaveLength(1)
  })
})

describe('GET /api/campaigns/:id', () => {
  it('returns 404 if campaign not found', async () => {
    vi.mocked(getCampaignWithSegment).mockResolvedValue(null)

    const app = buildApp()
    const res = await request(app, 'GET', '/api/campaigns/nonexistent')

    expect(res.status).toBe(404)
    expect((res.body as { success: boolean }).success).toBe(false)
  })

  it('returns 404 if campaign belongs to different project', async () => {
    vi.mocked(getCampaignWithSegment).mockResolvedValue({
      id: 'c1',
      projectId: 'different_project',
    } as never)

    const app = buildApp()
    const res = await request(app, 'GET', '/api/campaigns/c1')

    expect(res.status).toBe(404)
  })

  it('returns campaign when found and project matches', async () => {
    vi.mocked(getCampaignWithSegment).mockResolvedValue({
      id: 'c1',
      projectId: 'proj_test',
      name: 'My Campaign',
    } as never)

    const app = buildApp()
    const res = await request(app, 'GET', '/api/campaigns/c1')

    expect(res.status).toBe(200)
    expect((res.body as { data: { name: string } }).data.name).toBe('My Campaign')
  })
})

describe('POST /api/campaigns', () => {
  it('returns 400 when required fields are missing', async () => {
    const app = buildApp()
    const res = await request(app, 'POST', '/api/campaigns', { name: 'Test' })

    expect(res.status).toBe(400)
    expect((res.body as { success: boolean }).success).toBe(false)
  })

  it('creates a draft campaign with valid body', async () => {
    const { db } = await import('../db/connection.js')
    const mockDb = db as unknown as Record<string, ReturnType<typeof vi.fn>>
    const insertChain = { values: vi.fn().mockReturnThis(), returning: vi.fn().mockResolvedValue([
      { id: 'new_c1', name: 'Launch Sale', subject: 'Buy now!', htmlBody: '<p>Hi</p>', status: 'draft' },
    ])}
    mockDb.insert = vi.fn().mockReturnValue(insertChain)

    const app = buildApp()
    const res = await request(app, 'POST', '/api/campaigns', {
      name: 'Launch Sale',
      subject: 'Buy now!',
      htmlBody: '<p>Hi {{customer_name}}</p>',
      segmentId: 'seg_1',
    })

    expect(res.status).toBe(201)
    expect((res.body as { success: boolean }).success).toBe(true)
    expect((res.body as { data: { status: string } }).data.status).toBe('draft')
  })
})

describe('POST /api/campaigns/:id/send', () => {
  beforeEach(() => vi.clearAllMocks())

  it('dispatches a campaign and returns recipient count', async () => {
    vi.mocked(dispatchCampaign).mockResolvedValue(42)

    const app = buildApp()
    const res = await request(app, 'POST', '/api/campaigns/c1/send')

    expect(res.status).toBe(200)
    expect((res.body as { data: { totalRecipients: number } }).data.totalRecipients).toBe(42)
  })

  it('returns 400 if dispatch fails with user-facing error', async () => {
    vi.mocked(dispatchCampaign).mockRejectedValue(new Error('Target segment has no customers with email addresses'))

    const app = buildApp()
    const res = await request(app, 'POST', '/api/campaigns/c1/send')

    expect(res.status).toBe(400)
    expect((res.body as { error: string }).error).toContain('no customers')
  })
})
