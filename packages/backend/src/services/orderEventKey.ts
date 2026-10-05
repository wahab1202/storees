/**
 * ONE FINGERPRINT FOR AN ORDER EVENT, whichever door it came through.
 *
 * The same sale reaches Storees more than one way — a shop's live webhook, a pull of its
 * history, a connector sync, an API call — and each door used to fingerprint it its own
 * way: a webhook with no key at all, the API with a hash of the payload, the history
 * pull and imports with `<event>_historical:<order id>`. A unique index on
 * (project_id, idempotency_key) can only collapse copies whose keys MATCH, so the same
 * order arriving by two doors was stored twice. One shop's ledger held 5,083 purchase
 * rows for 1,779 orders.
 *
 * The format is the one the history pull and imports already write, so every row stored
 * so far keeps matching and nothing is re-saved. "historical" is a leftover of where the
 * format started; it is bookkeeping, not a statement about the event.
 *
 * Keyed by event NAME as well as order id, so the sale, its shipment, its delivery and
 * its refund are four different facts that each happen once.
 */
export function orderEventKey(eventName: string, orderId: string): string {
  return `${eventName}_historical:${orderId}`
}
