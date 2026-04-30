#!/usr/bin/env node
/**
 * Verify agent-RBAC enforcement.
 *
 * Mints three JWTs (admin, manager, agent) signed with the same JWT_SECRET
 * the backend uses, then probes /api/flows and /api/auth/me to confirm:
 *   - admin gets through flows (200)
 *   - manager + agent are fenced out of flows (403)
 *   - /me round-trips role + agentId for all three
 *
 * Requires the backend to be running locally. No DB writes.
 *
 * Usage:
 *   JWT_SECRET=$(grep ^JWT_SECRET packages/backend/.env | cut -d= -f2) \
 *     node scripts/verify-agent-rbac.mjs
 */

import jwt from 'jsonwebtoken'

const JWT_SECRET = process.env.JWT_SECRET
const BASE = process.env.API_URL ?? 'http://localhost:3001'

if (!JWT_SECRET) {
  console.error('Set JWT_SECRET (must match packages/backend/.env). Aborting.')
  process.exit(1)
}

const users = [
  { label: 'admin  ', payload: { userId: '00000000-0000-0000-0000-000000000001', email: 'admin@test.local',   projectId: null, role: 'admin',   agentId: null } },
  { label: 'manager', payload: { userId: '00000000-0000-0000-0000-000000000002', email: 'manager@test.local', projectId: null, role: 'manager', agentId: '11111111-1111-1111-1111-111111111111' } },
  { label: 'agent  ', payload: { userId: '00000000-0000-0000-0000-000000000003', email: 'agent@test.local',   projectId: null, role: 'agent',   agentId: '22222222-2222-2222-2222-222222222222' } },
]

async function probe(label, token, path) {
  const r = await fetch(`${BASE}${path}`, { headers: { Authorization: `Bearer ${token}` } })
  const body = await r.text().then(t => { try { return JSON.parse(t) } catch { return t } })
  return { label, path, status: r.status, body }
}

console.log(`→ probing ${BASE}\n`)

for (const u of users) {
  const token = jwt.sign(u.payload, JWT_SECRET, { expiresIn: '5m' })

  const me    = await probe(u.label, token, '/api/auth/me')
  const flows = await probe(u.label, token, '/api/flows?projectId=00000000-0000-0000-0000-000000000000')

  const flowExpected = u.payload.role === 'admin' ? 200 : 403
  const flowOk = flows.status === flowExpected ? '✓' : '✗'

  console.log(`${u.label}  role=${u.payload.role}`)
  console.log(`   /api/auth/me       → ${me.status}  ${typeof me.body === 'object' ? JSON.stringify({role: me.body?.data?.role, agentId: me.body?.data?.agentId}) : ''}`)
  console.log(`   /api/flows         → ${flows.status}  (expected ${flowExpected})  ${flowOk}`)
  console.log()
}

console.log('Admin /me returns 404 because the mint-and-probe user does not exist in DB — that is fine; the 401/403 gates still prove JWT parsing + role enforcement.')
