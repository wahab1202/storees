import { Router, Request, Response } from 'express'
import crypto from 'crypto'
import { db } from '../db/connection.js'
import { projects, apiKeys, events, segments } from '../db/schema.js'
import { eq, and, count } from 'drizzle-orm'
import { generateApiKeyPair } from '../middleware/apiKeyAuth.js'
import { getDomainConfig } from '../services/domainRegistry.js'
import type { DomainType, IntegrationType } from '@storees/shared'

const router = Router()

const VALID_DOMAINS: DomainType[] = ['ecommerce', 'fintech', 'saas', 'custom']

// ============ SEGMENT TEMPLATES PER DOMAIN ============

type SegmentTemplate = {
  name: string
  description: string
  filters: Record<string, unknown>
}

const DOMAIN_SEGMENT_TEMPLATES: Record<DomainType, SegmentTemplate[]> = {
  ecommerce: [
    {
      name: 'High Value Customers',
      description: 'Customers with total spend above average',
      filters: { logic: 'AND', rules: [{ field: 'total_spent', operator: 'greater_than', value: 500000 }] },
    },
    {
      name: 'At Risk',
      description: 'No orders in 30+ days',
      filters: { logic: 'AND', rules: [{ field: 'days_since_last_order', operator: 'greater_than', value: 30 }] },
    },
    {
      name: 'Repeat Buyers',
      description: 'Customers with 2+ orders',
      filters: { logic: 'AND', rules: [{ field: 'total_orders', operator: 'greater_than', value: 1 }] },
    },
  ],
  fintech: [
    {
      name: 'High Net Worth',
      description: 'Customers in top balance bracket',
      filters: { logic: 'AND', rules: [{ field: 'balance_bracket', operator: 'is', value: '25L+' }] },
    },
    {
      name: 'Dormant Accounts',
      description: 'No transactions in 60+ days',
      filters: { logic: 'AND', rules: [{ field: 'days_since_last_txn', operator: 'greater_than', value: 60 }] },
    },
    {
      name: 'Active Transactors',
      description: 'High transaction frequency',
      filters: { logic: 'AND', rules: [{ field: 'total_transactions', operator: 'greater_than', value: 50 }] },
    },
    {
      name: 'EMI Overdue',
      description: 'Customers with overdue EMIs',
      filters: { logic: 'AND', rules: [{ field: 'emi_overdue', operator: 'is_true', value: true }] },
    },
    {
      name: 'KYC Pending',
      description: 'Customers with incomplete KYC',
      filters: { logic: 'AND', rules: [{ field: 'kyc_status', operator: 'is', value: 'pending' }] },
    },
  ],
  saas: [
    {
      name: 'Trial Users',
      description: 'Customers currently in trial',
      filters: { logic: 'AND', rules: [{ field: 'trial_status', operator: 'is', value: 'in_trial' }] },
    },
    {
      name: 'Enterprise Accounts',
      description: 'Customers on enterprise plan',
      filters: { logic: 'AND', rules: [{ field: 'plan', operator: 'is', value: 'enterprise' }] },
    },
    {
      name: 'Low Engagement',
      description: 'Low feature usage count',
      filters: { logic: 'AND', rules: [{ field: 'feature_usage_count', operator: 'less_than', value: 5 }] },
    },
  ],
  custom: [
    {
      name: 'All Customers',
      description: 'Everyone in your customer base',
      filters: { logic: 'AND', rules: [] },
    },
  ],
}

// ============ INTEGRATION GUIDE DATA ============

function getIntegrationGuide(domainType: DomainType, apiKey: string, apiSecret: string, baseUrl: string) {
  const domain = getDomainConfig(domainType)

  const sampleEvents: Record<DomainType, Record<string, unknown>> = {
    ecommerce: {
      event_name: 'order_completed',
      customer_id: 'CUST_001',
      properties: {
        order_id: 'ORD_123',
        total: 250000,
        currency: 'INR',
        items: [{ name: 'Widget', quantity: 1, price: 250000 }],
      },
    },
    fintech: {
      event_name: 'transaction_completed',
      customer_id: 'CUST_001',
      properties: {
        transaction_id: 'TXN_123',
        type: 'debit',
        channel: 'upi',
        amount: 500000,
        currency: 'INR',
      },
    },
    saas: {
      event_name: 'feature_used',
      customer_id: 'CUST_001',
      properties: {
        feature: 'dashboard_export',
        plan: 'pro',
      },
    },
    custom: {
      event_name: 'custom_event',
      customer_id: 'CUST_001',
      properties: {
        key: 'value',
      },
    },
  }

  const sampleEvent = sampleEvents[domainType]

  return {
    domain_type: domainType,
    channels: domain.channels,
    api_base_url: `${baseUrl}/api/v1`,
    authentication: {
      method: 'API Key + Secret',
      headers: {
        'X-API-Key': apiKey,
        'X-API-Secret': apiSecret,
      },
    },
    endpoints: [
      {
        name: 'Track Event',
        method: 'POST',
        path: '/api/v1/events',
        description: 'Send a single event',
        curl: `curl -X POST ${baseUrl}/api/v1/events \\\n  -H "Content-Type: application/json" \\\n  -H "X-API-Key: ${apiKey}" \\\n  -H "X-API-Secret: ${apiSecret}" \\\n  -d '${JSON.stringify(sampleEvent, null, 2)}'`,
      },
      {
        name: 'Batch Events',
        method: 'POST',
        path: '/api/v1/events/batch',
        description: 'Send up to 1000 events at once',
        curl: `curl -X POST ${baseUrl}/api/v1/events/batch \\\n  -H "Content-Type: application/json" \\\n  -H "X-API-Key: ${apiKey}" \\\n  -H "X-API-Secret: ${apiSecret}" \\\n  -d '{"events": [${JSON.stringify(sampleEvent)}]}'`,
      },
      {
        name: 'Upsert Customer',
        method: 'POST',
        path: '/api/v1/customers',
        description: 'Create or update a customer profile',
        curl: `curl -X POST ${baseUrl}/api/v1/customers \\\n  -H "Content-Type: application/json" \\\n  -H "X-API-Key: ${apiKey}" \\\n  -H "X-API-Secret: ${apiSecret}" \\\n  -d '${JSON.stringify({
          customer_id: 'CUST_001',
          attributes: { email: 'user@example.com', name: 'John Doe', phone: '+919876543210' },
        }, null, 2)}'`,
      },
    ],
    sample_event: sampleEvent,
  }
}

/**
 * POST /api/onboarding/projects — Create a new project with domain type
 *
 * For ecommerce: returns Shopify install URL
 * For fintech/saas/custom: auto-generates API key pair + returns integration guide
 */
router.post('/projects', async (req: Request, res: Response) => {
  try {
    const { name, domain_type } = req.body as {
      name?: string
      domain_type?: DomainType
    }

    if (!name?.trim()) {
      return res.status(400).json({ success: false, error: 'name is required' })
    }

    if (!domain_type || !VALID_DOMAINS.includes(domain_type)) {
      return res.status(400).json({
        success: false,
        error: `domain_type must be one of: ${VALID_DOMAINS.join(', ')}`,
      })
    }

    // Determine integration type based on domain
    const integrationType: IntegrationType = domain_type === 'ecommerce' ? 'shopify' : 'api_key'

    // Generate webhook secret for all projects
    const webhookSecret = crypto.randomBytes(32).toString('hex')

    // Create project
    const [project] = await db.insert(projects).values({
      name: name.trim(),
      domainType: domain_type,
      integrationType,
      webhookSecret,
      settings: {},
    }).returning()

    // Seed domain-specific segment templates
    const templates = DOMAIN_SEGMENT_TEMPLATES[domain_type]
    for (const template of templates) {
      await db.insert(segments).values({
        projectId: project.id,
        name: template.name,
        description: template.description,
        type: 'template',
        filters: template.filters,
        isActive: true,
      })
    }

    // For non-ecommerce: auto-generate API key pair
    if (integrationType === 'api_key') {
      const { keyPublic, keySecret, keySecretHash } = generateApiKeyPair()

      await db.insert(apiKeys).values({
        projectId: project.id,
        name: 'Default',
        keyPublic,
        keySecretHash,
        permissions: ['read', 'write'],
        rateLimit: 1000,
      })

      const baseUrl = process.env.APP_URL ?? 'http://localhost:3001'
      const guide = getIntegrationGuide(domain_type, keyPublic, keySecret, baseUrl)

      return res.status(201).json({
        success: true,
        data: {
          project: {
            id: project.id,
            name: project.name,
            domain_type: project.domainType,
            integration_type: integrationType,
          },
          api_keys: {
            key_public: keyPublic,
            key_secret: keySecret,
            warning: 'Save the key_secret now. It cannot be retrieved again.',
          },
          integration_guide: guide,
          next_step: 'send_test_event',
        },
      })
    }

    // For ecommerce: return Shopify install URL
    const shopifyApiKey = process.env.SHOPIFY_API_KEY
    const appUrl = process.env.APP_URL ?? 'http://localhost:3001'

    return res.status(201).json({
      success: true,
      data: {
        project: {
          id: project.id,
          name: project.name,
          domain_type: project.domainType,
          integration_type: integrationType,
        },
        shopify: {
          install_url: shopifyApiKey
            ? `https://{shop}.myshopify.com/admin/oauth/authorize?client_id=${shopifyApiKey}&scope=read_customers,read_orders,read_checkouts,read_products&redirect_uri=${appUrl}/api/integrations/shopify/callback&state=${project.id}`
            : null,
          instructions: 'Replace {shop} with your Shopify store subdomain and visit the install URL.',
        },
        next_step: 'connect_shopify',
      },
    })
  } catch (err) {
    console.error('Project creation error:', err)
    res.status(500).json({ success: false, error: 'Failed to create project' })
  }
})

/**
 * GET /api/onboarding/projects/:id/integration-status — Check integration health
 *
 * Returns: whether first event received, total events, customers count, API key status
 */
router.get('/projects/:id/integration-status', async (req: Request, res: Response) => {
  try {
    const projectId = req.params.id as string

    // Get project
    const [project] = await db
      .select()
      .from(projects)
      .where(eq(projects.id, projectId))
      .limit(1)

    if (!project) {
      return res.status(404).json({ success: false, error: 'Project not found' })
    }

    // Count events
    const [eventCount] = await db
      .select({ count: count() })
      .from(events)
      .where(eq(events.projectId, projectId))

    // Count API keys
    const [keyCount] = await db
      .select({ count: count() })
      .from(apiKeys)
      .where(and(eq(apiKeys.projectId, projectId), eq(apiKeys.isActive, true)))

    const totalEvents = eventCount?.count ?? 0
    const activeKeys = keyCount?.count ?? 0
    const hasReceivedFirstEvent = totalEvents > 0

    // Determine integration status
    let status: 'pending' | 'waiting_for_data' | 'active'
    if (project.integrationType === 'shopify') {
      status = project.shopifyAccessToken ? (hasReceivedFirstEvent ? 'active' : 'waiting_for_data') : 'pending'
    } else {
      status = activeKeys > 0 ? (hasReceivedFirstEvent ? 'active' : 'waiting_for_data') : 'pending'
    }

    // Determine checklist
    const checklist = []
    if (project.integrationType === 'shopify') {
      checklist.push({ step: 'connect_shopify', label: 'Connect Shopify store', done: !!project.shopifyAccessToken })
      checklist.push({ step: 'sync_data', label: 'Sync customer & order data', done: hasReceivedFirstEvent })
    } else {
      checklist.push({ step: 'api_key_created', label: 'API key generated', done: activeKeys > 0 })
      checklist.push({ step: 'first_event', label: 'First event received', done: hasReceivedFirstEvent })
    }
    checklist.push({ step: 'segments_created', label: 'Segment templates seeded', done: true }) // always true — seeded on creation

    res.json({
      success: true,
      data: {
        project_id: projectId,
        domain_type: project.domainType,
        integration_type: project.integrationType,
        status,
        total_events: totalEvents,
        active_api_keys: activeKeys,
        has_received_first_event: hasReceivedFirstEvent,
        checklist,
      },
    })
  } catch (err) {
    console.error('Integration status error:', err)
    res.status(500).json({ success: false, error: 'Failed to get integration status' })
  }
})

/**
 * POST /api/onboarding/projects/:id/test-event — Send a test event to verify integration
 *
 * This is a convenience endpoint called from the onboarding wizard's "Test" button.
 * It creates a test event directly (no API key required since it's from the admin panel).
 */
router.post('/projects/:id/test-event', async (req: Request, res: Response) => {
  try {
    const projectId = req.params.id as string

    // Verify project exists
    const [project] = await db
      .select({ id: projects.id, domainType: projects.domainType })
      .from(projects)
      .where(eq(projects.id, projectId))
      .limit(1)

    if (!project) {
      return res.status(404).json({ success: false, error: 'Project not found' })
    }

    // Insert a test event
    const [event] = await db.insert(events).values({
      projectId,
      eventName: 'test_event',
      properties: {
        source: 'onboarding_wizard',
        message: 'Integration test event — your setup is working!',
      },
      platform: 'api',
      source: 'system',
      timestamp: new Date(),
    }).returning({ id: events.id })

    res.status(201).json({
      success: true,
      data: {
        event_id: event.id,
        message: 'Test event created successfully. Your integration is working!',
      },
    })
  } catch (err) {
    console.error('Test event error:', err)
    res.status(500).json({ success: false, error: 'Failed to create test event' })
  }
})

/**
 * GET /api/onboarding/projects/:id/guide — Get integration guide for a project
 *
 * Returns cURL examples, sample events, and endpoint documentation
 * tailored to the project's domain type.
 */
router.get('/projects/:id/guide', async (req: Request, res: Response) => {
  try {
    const projectId = req.params.id as string

    // Get project
    const [project] = await db
      .select()
      .from(projects)
      .where(eq(projects.id, projectId))
      .limit(1)

    if (!project) {
      return res.status(404).json({ success: false, error: 'Project not found' })
    }

    // Get active API key (first one)
    const [key] = await db
      .select({ keyPublic: apiKeys.keyPublic })
      .from(apiKeys)
      .where(and(eq(apiKeys.projectId, projectId), eq(apiKeys.isActive, true)))
      .limit(1)

    const baseUrl = process.env.APP_URL ?? 'http://localhost:3001'
    const domainType = project.domainType as DomainType

    // We can't show the secret again, so use placeholder
    const guide = getIntegrationGuide(
      domainType,
      key?.keyPublic ?? '<YOUR_API_KEY>',
      '<YOUR_API_SECRET>',
      baseUrl,
    )

    res.json({
      success: true,
      data: guide,
    })
  } catch (err) {
    console.error('Integration guide error:', err)
    res.status(500).json({ success: false, error: 'Failed to get integration guide' })
  }
})

/**
 * GET /api/onboarding/projects — List all projects (for admin/reset tooling)
 */
router.get('/projects', async (_req: Request, res: Response) => {
  try {
    const rows = await db
      .select({
        id: projects.id,
        name: projects.name,
        domainType: projects.domainType,
        integrationType: projects.integrationType,
        createdAt: projects.createdAt,
      })
      .from(projects)
      .orderBy(projects.createdAt)

    res.json({ success: true, data: rows })
  } catch (err) {
    console.error('List projects error:', err)
    res.status(500).json({ success: false, error: 'Failed to list projects' })
  }
})

/**
 * DELETE /api/onboarding/projects/:id — Delete a project and all its data
 *
 * Used by the resetToFintech script to clear the demo before re-seeding.
 * Relies on ON DELETE CASCADE in the DB schema.
 */
router.delete('/projects/:id', async (req: Request, res: Response) => {
  try {
    const projectId = req.params.id as string

    const [project] = await db
      .select({ id: projects.id, name: projects.name })
      .from(projects)
      .where(eq(projects.id, projectId))
      .limit(1)

    if (!project) {
      return res.status(404).json({ success: false, error: 'Project not found' })
    }

    await db.delete(projects).where(eq(projects.id, projectId))

    res.json({ success: true, data: { deleted: projectId, name: project.name } })
  } catch (err) {
    console.error('Delete project error:', err)
    res.status(500).json({ success: false, error: 'Failed to delete project' })
  }
})

export default router
