import { Router } from 'express'
import { requireProjectId } from '../middleware/projectId.js'
import { requireRole } from '../middleware/agentScope.js'
import { backfillIdentityEdges, shadowMergeReport, applyMerges, undoMerge } from '../services/identityGraphService.js'

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

// POST /api/identity/apply-merges — merge the would-merge clusters. Dry-run by
// default; ?dryRun=false performs a live merge and additionally requires
// ENABLE_IDENTITY_MERGE=true.
router.post('/apply-merges', requireRole('admin'), requireProjectId, async (req, res) => {
  try {
    const dryRun = req.query.dryRun !== 'false' && (req.body as { dryRun?: boolean })?.dryRun !== false
    const result = await applyMerges(req.projectId!, { dryRun })
    res.json({ success: true, data: result })
  } catch (err) {
    console.error('Identity apply-merges error:', err)
    const disabled = err instanceof Error && err.message.includes('disabled')
    res.status(disabled ? 409 : 500).json({
      success: false,
      error: err instanceof Error ? err.message : 'Merge failed',
    })
  }
})

// POST /api/identity/undo-merge — reverse a merge by id. Admin-gated but NOT
// flag-gated: undo must always work as the safety valve. Body/query: mergeId.
router.post('/undo-merge', requireRole('admin'), requireProjectId, async (req, res) => {
  try {
    const mergeId = (req.body as { mergeId?: string })?.mergeId ?? (req.query.mergeId as string | undefined)
    if (!mergeId) return res.status(400).json({ success: false, error: 'mergeId is required' })
    const result = await undoMerge(req.projectId!, mergeId)
    res.json({ success: true, data: result })
  } catch (err) {
    console.error('Identity undo-merge error:', err)
    const notFound = err instanceof Error && /not found|already undone/.test(err.message)
    res.status(notFound ? 404 : 500).json({
      success: false,
      error: err instanceof Error ? err.message : 'Undo failed',
    })
  }
})

export default router
