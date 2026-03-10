import { Router } from 'express'
import { requireProjectId } from '../middleware/projectId.js'
import { generateSegmentFilter, isAiEnabled } from '../services/aiSegmentService.js'

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

    // Map frontend role names to Gemini role names
    const geminiHistory = history?.map((msg: { role: string; text: string }) => ({
      role: msg.role === 'assistant' ? 'model' : 'user',
      text: msg.text,
    }))

    const result = await generateSegmentFilter(input.trim(), geminiHistory)

    res.json({ success: true, data: result })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'AI generation failed'
    console.error('[AI] Segment generation error:', message)
    res.status(500).json({ success: false, error: message })
  }
})

export default router
