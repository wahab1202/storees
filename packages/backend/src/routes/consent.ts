import { Router } from 'express'
import { requireProjectId } from '../middleware/projectId.js'
import {
  updateConsent,
  getConsentStatus,
  getConsentAuditLog,
  bulkUpdateConsent,
} from '../services/consentService.js'

const router = Router()

// GET /api/consent/:customerId?projectId=...
// Returns current consent status across all channels
router.get('/:customerId', requireProjectId, async (req, res) => {
  try {
    const status = await getConsentStatus(req.projectId!, req.params.customerId as string)
    if (!status) {
      return res.status(404).json({ success: false, error: 'Customer not found' })
    }
    res.json({ success: true, data: status })
  } catch (err) {
    console.error('Consent status error:', err)
    res.status(500).json({ success: false, error: 'Failed to fetch consent status' })
  }
})

// GET /api/consent/:customerId/audit?projectId=...&limit=50
// Returns immutable audit trail
router.get('/:customerId/audit', requireProjectId, async (req, res) => {
  try {
    const limit = req.query.limit ? Number(req.query.limit) : 50
    const log = await getConsentAuditLog(req.projectId!, req.params.customerId as string, limit)
    res.json({ success: true, data: log })
  } catch (err) {
    console.error('Consent audit log error:', err)
    res.status(500).json({ success: false, error: 'Failed to fetch consent audit log' })
  }
})

// POST /api/consent/:customerId?projectId=...
// Body: { channel, action, messageType?, consentText?, ipAddress? }
router.post('/:customerId', requireProjectId, async (req, res) => {
  try {
    const { channel, action, messageType, consentText, ipAddress } = req.body

    const validChannels = ['email', 'sms', 'push', 'whatsapp']
    const validActions = ['opt_in', 'opt_out']

    if (!channel || !validChannels.includes(channel)) {
      return res.status(400).json({
        success: false,
        error: `channel must be one of: ${validChannels.join(', ')}`,
      })
    }
    if (!action || !validActions.includes(action)) {
      return res.status(400).json({
        success: false,
        error: `action must be one of: ${validActions.join(', ')}`,
      })
    }

    const entry = await updateConsent(
      req.projectId!,
      req.params.customerId as string,
      channel,
      action,
      'admin',
      { messageType, consentText, ipAddress },
    )

    res.status(201).json({ success: true, data: entry })
  } catch (err) {
    console.error('Consent update error:', err)
    res.status(500).json({ success: false, error: 'Failed to update consent' })
  }
})

// POST /api/consent/:customerId/bulk?projectId=...
// Body: { updates: [{ channel, action }], ipAddress? }
router.post('/:customerId/bulk', requireProjectId, async (req, res) => {
  try {
    const { updates, ipAddress } = req.body

    if (!Array.isArray(updates) || updates.length === 0) {
      return res.status(400).json({ success: false, error: 'updates array required' })
    }

    const results = await bulkUpdateConsent(
      req.projectId!,
      req.params.customerId as string,
      updates,
      'admin',
      ipAddress,
    )

    res.status(201).json({ success: true, data: results })
  } catch (err) {
    console.error('Consent bulk update error:', err)
    res.status(500).json({ success: false, error: 'Failed to bulk update consent' })
  }
})

export default router
