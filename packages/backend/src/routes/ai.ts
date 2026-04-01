import { Router } from 'express'
import { eq, sql } from 'drizzle-orm'
import { db } from '../db/connection.js'
import { projects } from '../db/schema.js'
import { requireProjectId } from '../middleware/projectId.js'
import { generateSegmentFilter, isAiEnabled } from '../services/aiSegmentService.js'
import { computeNextBestAction } from '../services/nextBestActionService.js'
import { getLlmConfig, testConnection } from '../services/llmService.js'

const router = Router()

// GET /api/ai/status — check if AI features are available
router.get('/status', (_req, res) => {
  res.json({ success: true, data: { enabled: isAiEnabled() } })
})

// POST /api/ai/segment?projectId=...
// Body: { input: string, history?: { role: 'user' | 'assistant', text: string }[] }
router.post('/segment', requireProjectId, async (req, res) => {
  try {
    const { input, history } = req.body

    if (!input || typeof input !== 'string' || input.trim().length === 0) {
      return res.status(400).json({ success: false, error: 'Input text is required' })
    }

    if (input.length > 500) {
      return res.status(400).json({ success: false, error: 'Input too long (max 500 characters)' })
    }

    const projectId = req.query.projectId as string
    const result = await generateSegmentFilter(projectId, input.trim(), history)

    res.json({ success: true, data: result })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'AI generation failed'
    console.error('[AI] Segment generation error:', message)
    res.status(500).json({ success: false, error: message })
  }
})

// POST /api/ai/next-action/:customerId — Next Best Action for a customer
router.post('/next-action/:customerId', requireProjectId, async (req, res) => {
  try {
    const result = await computeNextBestAction(req.params.customerId as string, req.projectId!)
    res.json({ success: true, data: result })
  } catch (err) {
    console.error('Next Best Action error:', err)
    res.status(500).json({ success: false, error: 'Failed to compute next best action' })
  }
})

// GET /api/ai/config — Get current AI provider config (redacted key)
router.get('/config', requireProjectId, async (req, res) => {
  try {
    const config = await getLlmConfig(req.projectId!)
    if (!config) {
      return res.json({ success: true, data: { configured: false } })
    }
    res.json({
      success: true,
      data: {
        configured: true,
        provider: config.provider,
        model: config.model,
        apiKey: config.apiKey.slice(0, 8) + '...' + config.apiKey.slice(-4),
      },
    })
  } catch (err) {
    res.status(500).json({ success: false, error: 'Failed to fetch AI config' })
  }
})

// POST /api/ai/config — Save AI provider config
router.post('/config', requireProjectId, async (req, res) => {
  try {
    const { provider, apiKey, model } = req.body as {
      provider: string
      apiKey: string
      model?: string
    }

    if (!provider || !apiKey) {
      return res.status(400).json({ success: false, error: 'provider and apiKey are required' })
    }

    // Update project settings
    await db.execute(sql`
      UPDATE projects SET
        settings = COALESCE(settings, '{}'::jsonb)
          || jsonb_build_object(
            'ai_provider', ${provider},
            'ai_api_key', ${apiKey},
            'ai_model', ${model ?? ''}
          ),
        updated_at = NOW()
      WHERE id = ${req.projectId!}
    `)

    res.json({ success: true })
  } catch (err) {
    console.error('Save AI config error:', err)
    res.status(500).json({ success: false, error: 'Failed to save AI config' })
  }
})

// POST /api/ai/test-connection — Test LLM connection
router.post('/test-connection', requireProjectId, async (req, res) => {
  try {
    const config = await getLlmConfig(req.projectId!)
    if (!config) {
      return res.json({ success: false, error: 'No AI provider configured' })
    }
    const result = await testConnection(config)
    res.json({ success: true, data: result })
  } catch (err) {
    res.status(500).json({ success: false, error: 'Connection test failed' })
  }
})

export default router
