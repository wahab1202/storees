import { describe, it, expect } from 'vitest'
import { resolveEntitlements } from './entitlementService.js'

describe('resolveEntitlements', () => {
  it('trial: premium features off, finite caps', () => {
    const e = resolveEntitlements({ plan: 'trial', status: 'trialing' })
    expect(e.features.ai_chatbot).toBe(false)
    expect(e.features.predictions).toBe(false)
    expect(e.features.ai_email_designer).toBe(true)
    expect(e.limits.whatsapp_messages).toBe(100)
    expect(e.limits.email_messages).toBe(500)
    expect(e.limits.team_seats).toBe(1)
  })

  it('custom/pro: everything on, unlimited', () => {
    for (const plan of ['custom', 'pro', 'starter']) {
      const e = resolveEntitlements({ plan, status: 'active' })
      expect(e.features.ai_chatbot).toBe(true)
      expect(e.limits.whatsapp_messages).toBe(-1)
    }
  })

  it('unknown plan falls back to full', () => {
    const e = resolveEntitlements({ plan: 'enterprise-x', status: 'active' })
    expect(e.features.ai_chatbot).toBe(true)
    expect(e.limits.contacts).toBe(-1)
  })

  it('expired/suspended: premium off + sends blocked regardless of plan', () => {
    for (const status of ['expired', 'suspended', 'cancelled']) {
      const e = resolveEntitlements({ plan: 'pro', status })
      expect(e.features.ai_chatbot).toBe(false)
      expect(e.limits.whatsapp_messages).toBe(0)
      expect(e.limits.email_messages).toBe(0)
    }
  })

  it('per-project overrides win (grant a feature / raise a cap)', () => {
    const e = resolveEntitlements({
      plan: 'trial', status: 'trialing',
      overrides: { features: { ai_chatbot: true }, limits: { whatsapp_messages: 500 } },
    })
    expect(e.features.ai_chatbot).toBe(true)
    expect(e.limits.whatsapp_messages).toBe(500)
    expect(e.features.predictions).toBe(false) // untouched
  })

  it('computes trial days left (ceil, floored at 0)', () => {
    const inThreeDays = new Date(Date.now() + 3 * 86_400_000 + 1000)
    expect(resolveEntitlements({ plan: 'trial', status: 'trialing', trialEndsAt: inThreeDays }).trialDaysLeft).toBe(4)
    const past = new Date(Date.now() - 86_400_000)
    expect(resolveEntitlements({ plan: 'trial', status: 'expired', trialEndsAt: past }).trialDaysLeft).toBe(0)
    expect(resolveEntitlements({ plan: 'custom', status: 'active' }).trialDaysLeft).toBeNull()
  })
})
