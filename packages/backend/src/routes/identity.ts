import { Router } from 'express'
import { requireProjectId } from '../middleware/projectId.js'
import { requireRole } from '../middleware/agentScope.js'
import { backfillIdentityEdges, shadowMergeReport } from '../services/identityGraphService.js'

// Identity graph — Phase 2, step 2a (shadow mode). Admin-only. Nothing here
// mutates customer_id; backfill is additive and idempotent, the report is read-only.
const router = Router()

// POST /api/identity/backfill — populate identity_edges from existing customers
// + anonymous sessions for the current project.
router.post('/backfill', requireRole('admin'), requireProjectId, async (req, res) => {
  try {
    const result = await backfillIdentityEdges(req.projectId!)
    res.json({ success: true, data: result })
  } catch (err) {
    console.error('Identity backfill error:', err)
    res.status(500).json({ success: false, error: 'Backfill failed' })
  }
})

// GET /api/identity/shadow-report — identifiers resolving to >1 customer, i.e.
// the clusters that would merge once merging is enabled.
router.get('/shadow-report', requireRole('admin'), requireProjectId, async (req, res) => {
  try {
    const clusters = await shadowMergeReport(req.projectId!)
    res.json({ success: true, data: { clusters, count: clusters.length } })
  } catch (err) {
    console.error('Identity shadow-report error:', err)
    res.status(500).json({ success: false, error: 'Report failed' })
  }
})

export default router
