import { createHash } from 'node:crypto'
import { and, eq } from 'drizzle-orm'
import { db } from '../db/connection.js'
import { customers, segments } from '../db/schema.js'
import { filterToSql } from '@storees/segments'
import type { FilterConfig } from '@storees/shared'

// Gap 8: ad-platform audience export. Resolves the segment to its current
// member list, hashes PII per each platform's spec, returns a CSV the
// marketer uploads to that platform's Custom Audience tool.
//
// This commit ships the hash + CSV path. Direct API integration (Meta
// Marketing API, Google Ads API CustomerMatchList) is a follow-up — the
// hashing rules established here are exactly what those APIs require, so
// the next phase just replaces "return CSV" with "POST to platform".
//
// Phase 1 targets: Meta + Google. TikTok/Snap/Pinterest are wired but use
// the generic email+phone format and will be tightened with platform
// specifics in Phase 2.

export type AdPlatform = 'meta' | 'google' | 'tiktok' | 'snap' | 'pinterest'

export const SUPPORTED_PLATFORMS: AdPlatform[] = ['meta', 'google', 'tiktok', 'snap', 'pinterest']

type PlatformSpec = {
  label: string
  columns: string[]
  // Per-column getter from the normalized customer record. Each column
  // value is hashed before emit (SHA-256, lowercase hex) — the platform
  // does the rest.
  getters: Record<string, (c: NormalizedCustomer) => string | null>
}

type NormalizedCustomer = {
  email: string | null      // lowercased + trimmed
  phone: string | null      // E.164 digits-only, no leading + or spaces
  firstName: string | null  // lowercased + trimmed
  lastName: string | null   // lowercased + trimmed
}

const META_SPEC: PlatformSpec = {
  // Meta Custom Audience CSV. They accept multiple identity columns;
  // each non-empty cell counts as a match key. Header names match
  // Meta's documented format (see Marketing API → CustomAudience users).
  label: 'Meta Ads Custom Audience',
  columns: ['EMAIL_SHA256', 'PHONE_SHA256', 'FN_SHA256', 'LN_SHA256'],
  getters: {
    EMAIL_SHA256: (c) => c.email,
    PHONE_SHA256: (c) => c.phone,
    FN_SHA256: (c) => c.firstName,
    LN_SHA256: (c) => c.lastName,
  },
}

const GOOGLE_SPEC: PlatformSpec = {
  // Google Ads Customer Match. Google accepts pre-hashed identifiers in
  // a CSV upload, matching their documented column names.
  label: 'Google Ads Customer Match',
  columns: ['Email', 'Phone', 'First Name', 'Last Name'],
  getters: {
    Email: (c) => c.email,
    Phone: (c) => c.phone,
    'First Name': (c) => c.firstName,
    'Last Name': (c) => c.lastName,
  },
}

const GENERIC_SPEC: PlatformSpec = {
  // TikTok / Snap / Pinterest all accept hashed email + hashed phone in
  // a Custom Audience CSV. Column names vary slightly per platform —
  // Phase 2 will tighten these. For now, lowest-common-denominator works.
  label: 'Generic ad-platform Custom Audience',
  columns: ['email_sha256', 'phone_sha256'],
  getters: {
    email_sha256: (c) => c.email,
    phone_sha256: (c) => c.phone,
  },
}

const SPECS: Record<AdPlatform, PlatformSpec> = {
  meta: META_SPEC,
  google: GOOGLE_SPEC,
  tiktok: { ...GENERIC_SPEC, label: 'TikTok Ads Custom Audience' },
  snap: { ...GENERIC_SPEC, label: 'Snap Ads Custom Audience' },
  pinterest: { ...GENERIC_SPEC, label: 'Pinterest Ads Custom Audience' },
}

function sha256Hex(input: string): string {
  return createHash('sha256').update(input).digest('hex')
}

function normalizeEmail(raw: string | null): string | null {
  if (!raw) return null
  const e = raw.trim().toLowerCase()
  return e.includes('@') ? e : null
}

function normalizePhone(raw: string | null): string | null {
  if (!raw) return null
  // Strip everything except digits + leading '+'. Meta + Google both
  // recommend E.164 without the '+' for hashing.
  const digits = raw.replace(/[^\d]/g, '')
  return digits.length >= 7 ? digits : null
}

function normalizeName(raw: string | null): string | null {
  if (!raw) return null
  const n = raw.trim().toLowerCase()
  return n.length > 0 ? n : null
}

function splitName(name: string | null): { firstName: string | null; lastName: string | null } {
  if (!name) return { firstName: null, lastName: null }
  const parts = name.trim().split(/\s+/)
  return {
    firstName: normalizeName(parts[0] ?? null),
    lastName: parts.length > 1 ? normalizeName(parts.slice(1).join(' ')) : null,
  }
}

function escapeCsv(value: string): string {
  // Hashes are hex so they never contain comma/quote — keep escape logic
  // in place for future column types (e.g. tags, attribution windows).
  if (value.includes(',') || value.includes('"') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`
  }
  return value
}

export type AudienceExportResult = {
  filename: string
  csv: string
  rowCount: number
  platform: AdPlatform
  segmentName: string
}

export async function exportSegmentAudience(
  projectId: string,
  segmentId: string,
  platform: AdPlatform,
): Promise<AudienceExportResult> {
  const spec = SPECS[platform]
  if (!spec) throw new Error(`Unknown platform: ${platform}`)

  const [segment] = await db
    .select({ id: segments.id, name: segments.name, filters: segments.filters })
    .from(segments)
    .where(and(eq(segments.id, segmentId), eq(segments.projectId, projectId)))
    .limit(1)
  if (!segment) throw new Error('Segment not found')

  const sqlCond = filterToSql(segment.filters as FilterConfig)
  const rows = await db
    .select({ email: customers.email, phone: customers.phone, name: customers.name })
    .from(customers)
    .where(and(eq(customers.projectId, projectId), sqlCond))
    .limit(500_000)  // safety cap — most ad platforms cap upload at 100k-1M anyway

  // Normalize + hash
  const lines: string[] = [spec.columns.join(',')]
  let rowCount = 0
  for (const r of rows) {
    const { firstName, lastName } = splitName(r.name)
    const normalized: NormalizedCustomer = {
      email: normalizeEmail(r.email),
      phone: normalizePhone(r.phone),
      firstName,
      lastName,
    }
    // Skip rows with NO identifiers at all — they're unusable upstream.
    if (!normalized.email && !normalized.phone) continue
    const cells = spec.columns.map((col) => {
      const raw = spec.getters[col](normalized)
      return raw ? escapeCsv(sha256Hex(raw)) : ''
    })
    lines.push(cells.join(','))
    rowCount++
  }

  const safeName = segment.name.replace(/[^a-zA-Z0-9-_]/g, '_').slice(0, 60)
  const filename = `${safeName}__${platform}__${new Date().toISOString().slice(0, 10)}.csv`

  return {
    filename,
    csv: lines.join('\n'),
    rowCount,
    platform,
    segmentName: segment.name,
  }
}

export function platformLabel(platform: AdPlatform): string {
  return SPECS[platform]?.label ?? platform
}
