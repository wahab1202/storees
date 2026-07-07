import { Router, Request, Response } from 'express'
import crypto from 'crypto'
import { db } from '../db/connection.js'
import { projects, apiKeys, events, segments, consentAuditLog, customers, anonymousSessions } from '../db/schema.js'
import { eq, and, count, gte, lte, sql, isNotNull } from 'drizzle-orm'
import { generateApiKeyPair } from '../middleware/apiKeyAuth.js'
import { requireRole } from '../middleware/agentScope.js'
import { getDomainConfig } from '../services/domainRegistry.js'
import { registerDomain, checkDomainStatus } from '../services/emailDomainService.js'
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

    // Seed domain-specific segment templates. Skip any name that already
    // exists for the project so re-seeding / a later vertical pack can't
    // create duplicate "Repeat Buyers" rows (there is no unique constraint
    // on (project_id, name) — the check has to be explicit).
    const templates = DOMAIN_SEGMENT_TEMPLATES[domain_type]
    for (const template of templates) {
      const [dup] = await db.select({ id: segments.id }).from(segments)
        .where(and(eq(segments.projectId, project.id), eq(segments.name, template.name)))
        .limit(1)
      if (dup) continue
      await db.insert(segments).values({
        projectId: project.id,
        name: template.name,
        description: template.description,
        type: 'template',
        filters: template.filters,
        isActive: true,
      })
    }

    // Every project gets an API key — Shopify (or any vertical integration)
    // and the SDK are independent ingestion channels, and the SDK is required
    // for behavioural events even on Shopify stores.
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

    if (integrationType === 'api_key') {
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

    // Ecommerce: return Shopify install URL + the API key (for SDK events)
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
        api_keys: {
          key_public: keyPublic,
          key_secret: keySecret,
          warning: 'Save the key_secret now. It cannot be retrieved again.',
        },
        integration_guide: guide,
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
        features: projects.features,
        createdAt: projects.createdAt,
        settings: projects.settings,
      })
      .from(projects)
      .orderBy(projects.createdAt)

    // Expose `archived` from settings; don't leak the rest of settings (it can
    // hold encrypted Shopify creds) to the client.
    const data = rows.map(({ settings, ...r }) => ({
      ...r,
      archived: (settings as Record<string, unknown> | null)?.archived === true,
    }))
    res.json({ success: true, data })
  } catch (err) {
    console.error('List projects error:', err)
    res.status(500).json({ success: false, error: 'Failed to list projects' })
  }
})

/**
 * PATCH /api/onboarding/projects/:id/features — Update per-project feature flags
 *
 * Admin-only. Currently exposes:
 *   - agentScopedAccess: enables Dealer/Region/City segment fields and
 *     scoped customer access for agent/manager roles. Required for B2B
 *     multi-distributor setups (e.g. GowelMart).
 *
 * Body: { agentScopedAccess?: boolean, ...other future flags }
 * Returns: { features }  (full features object after merge)
 */
router.patch('/projects/:id/features', requireRole('admin'), async (req: Request, res: Response) => {
  try {
    const projectId = req.params.id as string
    const incoming = (req.body ?? {}) as Record<string, unknown>

    // Whitelist toggleable feature flags — refuse unknown keys so typos don't
    // silently land in the JSONB blob and accumulate over time.
    const ALLOWED_FLAGS = new Set(['agentScopedAccess'])
    const updates: Record<string, unknown> = {}
    for (const key of Object.keys(incoming)) {
      if (!ALLOWED_FLAGS.has(key)) {
        return res.status(400).json({ success: false, error: `Unknown feature flag: ${key}` })
      }
      if (typeof incoming[key] !== 'boolean') {
        return res.status(400).json({ success: false, error: `Feature flag '${key}' must be a boolean` })
      }
      updates[key] = incoming[key]
    }

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ success: false, error: 'No valid feature flags supplied' })
    }

    const [project] = await db
      .select({ features: projects.features })
      .from(projects)
      .where(eq(projects.id, projectId))
      .limit(1)

    if (!project) {
      return res.status(404).json({ success: false, error: 'Project not found' })
    }

    const merged = { ...((project.features as Record<string, unknown> | null) ?? {}), ...updates }

    await db
      .update(projects)
      .set({ features: merged, updatedAt: new Date() })
      .where(eq(projects.id, projectId))

    res.json({ success: true, data: { features: merged } })
  } catch (err) {
    console.error('Update features error:', err)
    res.status(500).json({ success: false, error: 'Failed to update features' })
  }
})

/**
 * POST /api/onboarding/projects/:id/email-domain — Register a sending domain
 *
 * Admin-only. Body: { domain: string, fromName: string }
 * Calls Resend's domains.create, stores resend_domain_id on the project, and
 * returns the DNS records the tenant needs to add to their domain. Idempotent
 * if a domain is already registered (returns current status without recreating).
 */
router.post('/projects/:id/email-domain', requireRole('admin'), async (req: Request, res: Response) => {
  try {
    const projectId = req.params.id as string
    const { domain, fromName, fromLocalPart } = (req.body ?? {}) as {
      domain?: string
      fromName?: string
      fromLocalPart?: string
    }

    if (!domain || typeof domain !== 'string') {
      return res.status(400).json({ success: false, error: 'domain is required' })
    }
    if (!fromName || typeof fromName !== 'string') {
      return res.status(400).json({ success: false, error: 'fromName is required' })
    }

    const result = await registerDomain(
      projectId,
      domain.trim().toLowerCase(),
      fromName.trim(),
      fromLocalPart?.trim() || 'hello', // default to a real inbox name, not noreply
    )
    res.json({ success: true, data: result })
  } catch (err) {
    console.error('Register email domain error:', err)
    const msg = err instanceof Error ? err.message : 'Failed to register domain'
    res.status(500).json({ success: false, error: msg })
  }
})

/**
 * GET /api/onboarding/projects/:id/email-domain — Refresh verification status
 *
 * Hits Resend's domains.get; on status='verified' stamps email_domain_verified_at
 * so future sends can use the per-tenant from-domain.
 */
router.get('/projects/:id/email-domain', requireRole('admin'), async (req: Request, res: Response) => {
  try {
    const projectId = req.params.id as string

    const [project] = await db
      .select({
        resendDomainId: projects.resendDomainId,
        emailFromAddress: projects.emailFromAddress,
        emailFromName: projects.emailFromName,
        emailDomainVerifiedAt: projects.emailDomainVerifiedAt,
      })
      .from(projects)
      .where(eq(projects.id, projectId))
      .limit(1)

    if (!project) {
      return res.status(404).json({ success: false, error: 'Project not found' })
    }

    if (!project.resendDomainId) {
      return res.json({
        success: true,
        data: {
          registered: false,
          fromAddress: null,
          fromName: null,
          status: 'not_registered',
          records: [],
          verified: false,
        },
      })
    }

    const result = await checkDomainStatus(projectId)
    res.json({
      success: true,
      data: {
        registered: true,
        fromAddress: project.emailFromAddress,
        fromName: project.emailFromName,
        ...result,
      },
    })
  } catch (err) {
    console.error('Get email domain status error:', err)
    const msg = err instanceof Error ? err.message : 'Failed to fetch domain status'
    res.status(500).json({ success: false, error: msg })
  }
})

/**
 * PATCH /api/onboarding/projects/:id/frequency-caps
 *
 * Admin-only. Body: { whatsapp_marketing?: { perDays, max }, sms_marketing?: ..., ... }
 * Validates each cap against sane bounds (perDays 1-90, max 0-100; max=0 disables
 * the cap for that channel). Caches in deliveryService are invalidated server-side
 * via the next cache TTL (60s); we don't import deliveryService here to keep the
 * route module dependency-free.
 */
router.patch('/projects/:id/frequency-caps', requireRole('admin'), async (req: Request, res: Response) => {
  try {
    const projectId = req.params.id as string
    const incoming = (req.body ?? {}) as Record<string, { perDays?: number; max?: number }>

    const ALLOWED_CHANNELS = new Set([
      'whatsapp_marketing', 'sms_marketing', 'email_marketing', 'push_marketing',
    ])
    const sanitised: Record<string, { perDays: number; max: number }> = {}
    for (const [key, val] of Object.entries(incoming)) {
      if (!ALLOWED_CHANNELS.has(key)) {
        return res.status(400).json({ success: false, error: `Unknown frequency-cap key: ${key}` })
      }
      const perDays = Number(val?.perDays)
      const max = Number(val?.max)
      if (!Number.isFinite(perDays) || perDays < 1 || perDays > 90) {
        return res.status(400).json({ success: false, error: `${key}.perDays must be 1-90` })
      }
      if (!Number.isFinite(max) || max < 0 || max > 100) {
        return res.status(400).json({ success: false, error: `${key}.max must be 0-100 (0 disables the cap)` })
      }
      sanitised[key] = { perDays, max }
    }

    const [project] = await db
      .select({ caps: projects.frequencyCaps })
      .from(projects)
      .where(eq(projects.id, projectId))
      .limit(1)

    if (!project) {
      return res.status(404).json({ success: false, error: 'Project not found' })
    }

    const merged = { ...((project.caps as Record<string, unknown> | null) ?? {}), ...sanitised }
    await db
      .update(projects)
      .set({ frequencyCaps: merged, updatedAt: new Date() })
      .where(eq(projects.id, projectId))

    res.json({ success: true, data: { frequencyCaps: merged } })
  } catch (err) {
    console.error('Update frequency caps error:', err)
    res.status(500).json({ success: false, error: 'Failed to update frequency caps' })
  }
})

/**
 * GET /api/onboarding/projects/:id/frequency-caps
 *
 * Returns the project's current frequency-cap config so the Settings UI can
 * pre-populate the form.
 */
router.get('/projects/:id/frequency-caps', requireRole('admin'), async (req: Request, res: Response) => {
  try {
    const projectId = req.params.id as string
    const [project] = await db
      .select({ caps: projects.frequencyCaps })
      .from(projects)
      .where(eq(projects.id, projectId))
      .limit(1)

    if (!project) return res.status(404).json({ success: false, error: 'Project not found' })
    res.json({ success: true, data: { frequencyCaps: project.caps } })
  } catch (err) {
    console.error('Get frequency caps error:', err)
    res.status(500).json({ success: false, error: 'Failed to fetch frequency caps' })
  }
})

/**
 * GET /api/onboarding/projects/:id/identity-merge-stats?days=30
 *
 * Phase F3 observability — proves the back-attribution flow works.
 * Returns: total resolutions, total events back-attributed, total flows
 * triggered from replay, in the requested window. Drives the dashboard
 * card "X anonymous browsers identified, Y events back-attributed last
 * month".
 */
router.get('/projects/:id/identity-merge-stats', requireRole('admin'), async (req: Request, res: Response) => {
  try {
    const projectId = req.params.id as string
    const days = Math.min(Math.max(Number(req.query.days ?? 30), 1), 365)
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000)

    const [row] = await db
      .select({
        resolutions: sql<number>`COUNT(*)::int`,
        completed: sql<number>`COUNT(*) FILTER (WHERE ${anonymousSessions.resolvedAt} IS NOT NULL)::int`,
        eventsAttributed: sql<number>`COALESCE(SUM(${anonymousSessions.eventsBackAttributed}), 0)::int`,
        flowsTriggered: sql<number>`COALESCE(SUM(${anonymousSessions.flowsTriggered}), 0)::int`,
      })
      .from(anonymousSessions)
      .where(and(
        eq(anonymousSessions.projectId, projectId),
        gte(anonymousSessions.linkedAt, since),
      ))

    res.json({
      success: true,
      data: {
        windowDays: days,
        resolutions: row?.resolutions ?? 0,
        completedResolutions: row?.completed ?? 0,
        eventsBackAttributed: row?.eventsAttributed ?? 0,
        flowsTriggered: row?.flowsTriggered ?? 0,
      },
    })
  } catch (err) {
    console.error('Identity merge stats error:', err)
    res.status(500).json({ success: false, error: 'Failed to load identity merge stats' })
  }
})

/**
 * GET /api/onboarding/projects/:id/consent-export?from=YYYY-MM-DD&to=YYYY-MM-DD
 *
 * Streams a CSV of every consent_audit_log row for the project in the date
 * range. Used by merchants when responding to a DPDP regulator audit or a
 * Meta WABA quality-rating dispute (Meta's review team asks for the consent
 * proof for every reported message).
 *
 * Admin-only. Default range: last 90 days.
 */
router.get('/projects/:id/consent-export', requireRole('admin'), async (req: Request, res: Response) => {
  try {
    const projectId = req.params.id as string
    const fromStr = (req.query.from as string) ?? ''
    const toStr = (req.query.to as string) ?? ''

    const from = fromStr ? new Date(fromStr) : new Date(Date.now() - 90 * 24 * 60 * 60 * 1000)
    const to = toStr ? new Date(toStr) : new Date()

    if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
      return res.status(400).json({ success: false, error: 'Invalid from/to date (use YYYY-MM-DD)' })
    }

    res.setHeader('Content-Type', 'text/csv; charset=utf-8')
    res.setHeader('Content-Disposition', `attachment; filename="consent-audit-${projectId}-${fromStr || 'auto'}-to-${toStr || 'now'}.csv"`)

    const writeRow = (cells: (string | null | undefined)[]) => {
      const escaped = cells.map(v => {
        if (v == null) return ''
        const s = String(v)
        return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
      }).join(',')
      res.write(escaped + '\n')
    }

    writeRow(['created_at', 'customer_id', 'customer_email', 'customer_phone', 'channel', 'message_type', 'action', 'source', 'ip_address', 'consent_text'])

    // Stream rows so we don't OOM on large exports. Drizzle doesn't expose
    // streaming directly; do paged reads of 1000 by primary key.
    const PAGE = 1000
    let cursorTs: Date = from
    while (true) {
      const rows = await db
        .select({
          createdAt: consentAuditLog.createdAt,
          customerId: consentAuditLog.customerId,
          email: customers.email,
          phone: customers.phone,
          channel: consentAuditLog.channel,
          messageType: consentAuditLog.messageType,
          action: consentAuditLog.action,
          source: consentAuditLog.source,
          ipAddress: consentAuditLog.ipAddress,
          consentText: consentAuditLog.consentText,
        })
        .from(consentAuditLog)
        .leftJoin(customers, eq(customers.id, consentAuditLog.customerId))
        .where(and(
          eq(consentAuditLog.projectId, projectId),
          gte(consentAuditLog.createdAt, cursorTs),
          lte(consentAuditLog.createdAt, to),
        ))
        .orderBy(sql`${consentAuditLog.createdAt} ASC`)
        .limit(PAGE)

      if (rows.length === 0) break

      for (const r of rows) {
        writeRow([
          r.createdAt.toISOString(),
          r.customerId,
          r.email,
          r.phone,
          r.channel,
          r.messageType,
          r.action,
          r.source,
          r.ipAddress,
          r.consentText,
        ])
      }

      if (rows.length < PAGE) break
      // Advance cursor by 1ms past the last row's timestamp
      cursorTs = new Date(rows[rows.length - 1].createdAt.getTime() + 1)
    }

    res.end()
  } catch (err) {
    console.error('Consent export error:', err)
    if (!res.headersSent) {
      res.status(500).json({ success: false, error: 'Failed to export consent log' })
    }
  }
})

/**
 * DELETE /api/onboarding/projects/:id — Delete a project and all its data
 *
 * Used by the resetToFintech script to clear the demo before re-seeding.
 * Relies on ON DELETE CASCADE in the DB schema.
 */
// POST /projects/:id/archive — soft-remove (reversible). Hides the project from
// the active list without touching its data. Preferred over delete, which FK-
// fails on projects that have synced customers/orders/events.
router.post('/projects/:id/archive', async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string
    const [p] = await db.select({ settings: projects.settings }).from(projects).where(eq(projects.id, id)).limit(1)
    if (!p) return res.status(404).json({ success: false, error: 'Project not found' })
    const settings = { ...((p.settings ?? {}) as Record<string, unknown>), archived: true, archivedAt: new Date().toISOString() }
    await db.update(projects).set({ settings, updatedAt: new Date() }).where(eq(projects.id, id))
    res.json({ success: true })
  } catch (err) {
    console.error('Archive project error:', err)
    res.status(500).json({ success: false, error: 'Failed to archive project' })
  }
})

// POST /projects/:id/unarchive — restore an archived project.
router.post('/projects/:id/unarchive', async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string
    const [p] = await db.select({ settings: projects.settings }).from(projects).where(eq(projects.id, id)).limit(1)
    if (!p) return res.status(404).json({ success: false, error: 'Project not found' })
    const settings = { ...((p.settings ?? {}) as Record<string, unknown>) }
    delete settings.archived
    delete settings.archivedAt
    await db.update(projects).set({ settings, updatedAt: new Date() }).where(eq(projects.id, id))
    res.json({ success: true })
  } catch (err) {
    console.error('Unarchive project error:', err)
    res.status(500).json({ success: false, error: 'Failed to restore project' })
  }
})

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

    // Cascade purge: delete the project's rows from every project-scoped table,
    // then the project itself. Tables are auto-discovered (every table has a
    // project_id column, per the multi-tenant convention). Each table delete
    // runs in a savepoint so an FK-blocked delete (a child not yet cleared) can
    // be retried on a later pass — this converges for any DAG of project FKs.
    // If something genuinely can't be cleared, the whole tx rolls back (no
    // partial wipe) and we return an error.
    await db.transaction(async (tx) => {
      const discovered = await tx.execute(sql`
        SELECT table_name FROM information_schema.columns
        WHERE table_schema = 'public' AND column_name = 'project_id' AND table_name <> 'projects'
      `)
      let remaining = (discovered.rows as Array<{ table_name: string }>).map(r => r.table_name)
      let progress = true
      while (remaining.length > 0 && progress) {
        progress = false
        const failed: string[] = []
        for (const table of remaining) {
          try {
            await tx.transaction(async (sp) => {
              await sp.execute(sql`DELETE FROM ${sql.identifier(table)} WHERE project_id = ${projectId}`)
            })
            progress = true
          } catch {
            failed.push(table)
          }
        }
        remaining = failed
      }
      if (remaining.length > 0) {
        throw new Error(`Could not clear dependent data in: ${remaining.join(', ')}`)
      }
      await tx.delete(projects).where(eq(projects.id, projectId))
    })

    res.json({ success: true, data: { deleted: projectId, name: project.name } })
  } catch (err) {
    console.error('Delete project error:', err)
    res.status(400).json({ success: false, error: (err as Error).message || 'Failed to delete project' })
  }
})

export default router
