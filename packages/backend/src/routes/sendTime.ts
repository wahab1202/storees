import { Router } from 'express'
import { requireProjectId } from '../middleware/projectId.js'
import { computeOptimalSendTime, computeProjectDefaults } from '../services/sendTimeService.js'
import { computeChannelScores } from '../services/channelScoreService.js'

const router = Router()

// GET /api/send-time/customer/:customerId — Optimal send time for a customer
router.get('/customer/:customerId', requireProjectId, async (req, res) => {
  try {
    const result = await computeOptimalSendTime(req.params.customerId as string, req.projectId!)
    res.json({ success: true, data: result })
  } catch (err) {
    console.error('Send time error:', err)
    res.status(500).json({ success: false, error: 'Failed to compute send time' })
  }
})

// GET /api/send-time/defaults — Project-wide defaults
router.get('/defaults', requireProjectId, async (req, res) => {
  try {
    const result = await computeProjectDefaults(req.projectId!)
    res.json({ success: true, data: result })
  } catch (err) {
    console.error('Send time defaults error:', err)
    res.status(500).json({ success: false, error: 'Failed to compute defaults' })
  }
})

// GET /api/send-time/channel-scores/:customerId — Channel ranking for a customer
router.get('/channel-scores/:customerId', requireProjectId, async (req, res) => {
  try {
    const result = await computeChannelScores(req.params.customerId as string, req.projectId!)
    res.json({ success: true, data: result })
  } catch (err) {
    console.error('Channel scores error:', err)
    res.status(500).json({ success: false, error: 'Failed to compute channel scores' })
  }
})

export default router
