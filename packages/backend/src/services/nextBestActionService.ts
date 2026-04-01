import { eq, and, sql, desc } from 'drizzle-orm'
import { db } from '../db/connection.js'
import { customers, events, customerSegments, segments, projects } from '../db/schema.js'
import { getLlmConfig, chatCompletion } from './llmService.js'

type NextBestAction = {
  action: 'send_offer' | 'win_back' | 'upsell' | 'nurture' | 'do_nothing'
  channel: string
  reason: string
  template_suggestion: string
  confidence: number
}

/**
 * Compute the Next Best Action for a customer using LLM analysis.
 * Assembles customer context (profile, scores, recent events, segments)
 * and asks the configured LLM to recommend an action.
 */
export async function computeNextBestAction(
  customerId: string,
  projectId: string,
): Promise<NextBestAction> {
  const config = await getLlmConfig(projectId)
  if (!config) {
    return fallbackAction(customerId)
  }

  // Gather customer context
  const [customer] = await db
    .select()
    .from(customers)
    .where(and(eq(customers.id, customerId), eq(customers.projectId, projectId)))
    .limit(1)

  if (!customer) {
    throw new Error('Customer not found')
  }

  const [project] = await db
    .select({ name: projects.name, domainType: projects.domainType })
    .from(projects)
    .where(eq(projects.id, projectId))
    .limit(1)

  // Get customer segments
  const custSegments = await db
    .select({ name: segments.name })
    .from(customerSegments)
    .innerJoin(segments, eq(segments.id, customerSegments.segmentId))
    .where(eq(customerSegments.customerId, customerId))

  // Get recent events (last 5)
  const recentEvents = await db
    .select({
      eventName: events.eventName,
      timestamp: events.timestamp,
      properties: events.properties,
    })
    .from(events)
    .where(and(eq(events.projectId, projectId), eq(events.customerId, customerId)))
    .orderBy(desc(events.timestamp))
    .limit(5)

  const metrics = (customer.metrics ?? {}) as Record<string, unknown>
  const daysSinceLastOrder = metrics.days_since_last_order ?? 'unknown'
  const engagementScore = metrics.engagement_score ?? 0
  const churnRisk = metrics.churn_risk ?? 0
  const clvHealth = metrics.clv_health ?? 'unknown'
  const bestChannel = metrics.best_channel ?? 'email'

  const segmentNames = custSegments.map(s => s.name).join(', ') || 'None'
  const eventSummary = recentEvents
    .map(e => `${e.eventName} (${new Date(e.timestamp).toLocaleDateString()})`)
    .join(', ') || 'No recent events'

  const systemPrompt = `You are an AI marketing assistant for ${project?.name ?? 'an ecommerce business'}.
Your job is to recommend the single best action to take for a specific customer right now.

Available actions:
- send_offer: Send a promotional message with a specific incentive (discount, free shipping, bundle deal)
- win_back: Re-engagement campaign with urgency ("We miss you", limited-time offer)
- upsell: Recommend higher-value or complementary products based on purchase history
- nurture: Educational or relationship-building content (tips, new arrivals, loyalty program)
- do_nothing: Customer is healthy and engaged — don't over-communicate

Consider:
- High engagement + recent orders → nurture or upsell, not offers
- High churn risk + declining engagement → win_back with strong incentive
- New customer with 1 order → nurture to build relationship
- Very active customer → do_nothing or gentle upsell
- Lapsed 60+ days → win_back before they churn

Respond ONLY with a JSON object (no markdown, no explanation):
{
  "action": "send_offer" | "win_back" | "upsell" | "nurture" | "do_nothing",
  "channel": "email" | "sms" | "push" | "whatsapp",
  "reason": "1-2 sentence explanation",
  "template_suggestion": "Brief template idea",
  "confidence": 0.0-1.0
}`

  const userPrompt = `Customer: ${customer.name ?? 'Unknown'}
Email: ${customer.email ?? 'N/A'}
Total Orders: ${customer.totalOrders}
Total Spent: ₹${Number(customer.totalSpent).toLocaleString('en-IN')}
CLV: ₹${Number(customer.clv).toLocaleString('en-IN')}
CLV Health: ${clvHealth}
Engagement Score: ${engagementScore}/100
Churn Risk: ${churnRisk}%
Days Since Last Order: ${daysSinceLastOrder}
Segments: ${segmentNames}
Recent Events: ${eventSummary}
Preferred Channel: ${bestChannel}`

  try {
    const response = await chatCompletion(config, [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ], { temperature: 0.3, maxTokens: 300 })

    // Parse JSON response
    const cleaned = response.content.replace(/```json\n?|\n?```/g, '').trim()
    const parsed = JSON.parse(cleaned) as NextBestAction

    // Validate action type
    const validActions = ['send_offer', 'win_back', 'upsell', 'nurture', 'do_nothing']
    if (!validActions.includes(parsed.action)) {
      parsed.action = 'nurture'
    }

    return {
      action: parsed.action,
      channel: parsed.channel ?? 'email',
      reason: parsed.reason ?? 'Based on customer profile analysis',
      template_suggestion: parsed.template_suggestion ?? '',
      confidence: Math.min(1, Math.max(0, Number(parsed.confidence ?? 0.7))),
    }
  } catch (err) {
    console.error('NBA LLM error:', err)
    return fallbackAction(customerId)
  }
}

/**
 * Deterministic fallback when LLM is not available.
 */
async function fallbackAction(customerId: string): Promise<NextBestAction> {
  const [customer] = await db
    .select({
      totalOrders: customers.totalOrders,
      metrics: customers.metrics,
    })
    .from(customers)
    .where(eq(customers.id, customerId))
    .limit(1)

  if (!customer) {
    return { action: 'do_nothing', channel: 'email', reason: 'Customer not found', template_suggestion: '', confidence: 0 }
  }

  const metrics = (customer.metrics ?? {}) as Record<string, unknown>
  const churnRisk = Number(metrics.churn_risk ?? 0)
  const engagement = Number(metrics.engagement_score ?? 0)
  const clvHealth = String(metrics.clv_health ?? 'unknown')

  if (clvHealth === 'churned' || churnRisk > 80) {
    return { action: 'win_back', channel: 'email', reason: 'High churn risk — needs urgent re-engagement', template_suggestion: 'We miss you! Here\'s 15% off your next order', confidence: 0.6 }
  }
  if (clvHealth === 'at_risk' || churnRisk > 50) {
    return { action: 'send_offer', channel: 'email', reason: 'At risk of churning — incentivize return', template_suggestion: 'Special offer just for you — limited time', confidence: 0.5 }
  }
  if (customer.totalOrders === 1) {
    return { action: 'nurture', channel: 'email', reason: 'New customer — build relationship', template_suggestion: 'Welcome! Here are our top picks for you', confidence: 0.5 }
  }
  if (engagement > 70 && clvHealth === 'growing') {
    return { action: 'upsell', channel: 'email', reason: 'Highly engaged customer — opportunity to increase order value', template_suggestion: 'Customers like you also bought...', confidence: 0.5 }
  }

  return { action: 'do_nothing', channel: 'email', reason: 'Customer is healthy — no action needed right now', template_suggestion: '', confidence: 0.5 }
}
