import { eq } from 'drizzle-orm'
import { db } from '../db/connection.js'
import { customers, agents } from '../db/schema.js'

export type DealerContact = { phone: string | null; email: string | null; name: string | null }

/**
 * Resolve a customer's dealer (agent) contact — the target for dealer-directed
 * notifications ("notify the dealer when their customer abandons a cart"). A
 * customer links to a dealer via customers.agent_id; the agents table holds the
 * dealer's phone/email. Returns null when the customer has no dealer.
 */
export async function resolveDealerContact(customerId: string): Promise<DealerContact | null> {
  const [row] = await db
    .select({ phone: agents.phone, email: agents.email, name: agents.name })
    .from(customers)
    .innerJoin(agents, eq(agents.id, customers.agentId))
    .where(eq(customers.id, customerId))
    .limit(1)
  return row ?? null
}

/** True if the dealer is reachable on the given channel (has the needed contact). */
export function dealerReachableOn(contact: DealerContact | null, channel: string): boolean {
  if (!contact) return false
  if (channel === 'email') return !!contact.email?.trim()
  // sms / whatsapp / push-less fallback all use the phone.
  return !!contact.phone?.trim()
}
