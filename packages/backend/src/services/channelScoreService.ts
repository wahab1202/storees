import { sql } from 'drizzle-orm'
import { db } from '../db/connection.js'

type ChannelScore = {
  channel: string
  sent: number
  opened: number
  clicked: number
  open_rate: number
  click_rate: number
  score: number // 0-100 composite score
}

type ChannelScoreResult = {
  best_channel: string | null
  channel_scores: Record<string, number>
  channels: ChannelScore[]
}

/**
 * Compute per-customer channel engagement scores from the messages table.
 * Uses Bayesian smoothing with project-level priors for customers with limited data.
 */
export async function computeChannelScores(
  customerId: string,
  projectId: string,
): Promise<ChannelScoreResult> {
  // Customer-level channel stats
  const result = await db.execute(sql`
    SELECT
      channel,
      COUNT(*) AS sent,
      COUNT(*) FILTER (WHERE read_at IS NOT NULL) AS opened,
      COUNT(*) FILTER (WHERE clicked_at IS NOT NULL) AS clicked
    FROM messages
    WHERE customer_id = ${customerId}
      AND project_id = ${projectId}
      AND status NOT IN ('blocked', 'failed')
    GROUP BY channel
  `)

  const rows = result.rows as Array<Record<string, unknown>>

  // If customer has no message history, get project-level priors
  if (rows.length === 0) {
    return computeProjectChannelDefaults(projectId)
  }

  // Compute scores with Bayesian smoothing
  // Prior: assume 20% open rate, 5% click rate (smoothed with 5 pseudo-observations)
  const PRIOR_OPENS = 5
  const PRIOR_OPEN_RATE = 0.2
  const PRIOR_CLICK_RATE = 0.05

  const channels: ChannelScore[] = rows.map(row => {
    const sent = Number(row.sent ?? 0)
    const opened = Number(row.opened ?? 0)
    const clicked = Number(row.clicked ?? 0)

    // Bayesian smoothed rates
    const openRate = (opened + PRIOR_OPENS * PRIOR_OPEN_RATE) / (sent + PRIOR_OPENS)
    const clickRate = (clicked + PRIOR_OPENS * PRIOR_CLICK_RATE) / (sent + PRIOR_OPENS)

    // Composite score: 60% open rate + 40% click rate, scaled to 0-100
    const score = Math.round((openRate * 0.6 + clickRate * 0.4) * 100)

    return {
      channel: String(row.channel),
      sent,
      opened,
      clicked,
      open_rate: Math.round(openRate * 1000) / 10,
      click_rate: Math.round(clickRate * 1000) / 10,
      score,
    }
  })

  channels.sort((a, b) => b.score - a.score)

  const scoreMap: Record<string, number> = {}
  for (const ch of channels) {
    scoreMap[ch.channel] = ch.score
  }

  return {
    best_channel: channels[0]?.channel ?? null,
    channel_scores: scoreMap,
    channels,
  }
}

async function computeProjectChannelDefaults(projectId: string): Promise<ChannelScoreResult> {
  const result = await db.execute(sql`
    SELECT
      channel,
      COUNT(*) AS sent,
      COUNT(*) FILTER (WHERE read_at IS NOT NULL) AS opened,
      COUNT(*) FILTER (WHERE clicked_at IS NOT NULL) AS clicked
    FROM messages
    WHERE project_id = ${projectId}
      AND status NOT IN ('blocked', 'failed')
    GROUP BY channel
    ORDER BY COUNT(*) FILTER (WHERE read_at IS NOT NULL)::float / NULLIF(COUNT(*), 0) DESC
  `)

  const rows = result.rows as Array<Record<string, unknown>>
  if (rows.length === 0) {
    return { best_channel: 'email', channel_scores: { email: 50 }, channels: [] }
  }

  const channels: ChannelScore[] = rows.map(row => {
    const sent = Number(row.sent ?? 0)
    const opened = Number(row.opened ?? 0)
    const clicked = Number(row.clicked ?? 0)
    const openRate = sent > 0 ? opened / sent : 0
    const clickRate = sent > 0 ? clicked / sent : 0
    const score = Math.round((openRate * 0.6 + clickRate * 0.4) * 100)

    return {
      channel: String(row.channel),
      sent, opened, clicked,
      open_rate: Math.round(openRate * 1000) / 10,
      click_rate: Math.round(clickRate * 1000) / 10,
      score,
    }
  })

  channels.sort((a, b) => b.score - a.score)
  const scoreMap: Record<string, number> = {}
  for (const ch of channels) scoreMap[ch.channel] = ch.score

  return { best_channel: channels[0]?.channel ?? 'email', channel_scores: scoreMap, channels }
}
