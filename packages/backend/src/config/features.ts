/**
 * Feature flag helpers. Two layers:
 *   1. Env var — gates the whole code path at deploy time (e.g. GowelMart's server)
 *   2. Per-project flag — lets a single deployment turn the feature on for some
 *      projects and not others (useful if we ever multi-tenant this build again)
 *
 * Scope enforcement based on JWT role runs unconditionally — these flags only
 * control whether the UI/routes that MANAGE agents are exposed.
 */

export function agentRbacEnabled(
  projectFeatures?: Record<string, unknown> | null
): boolean {
  if (process.env.ENABLE_AGENT_RBAC === 'true') return true
  return !!projectFeatures?.agentScopedAccess
}

/**
 * Device-level identity stitching. When on, the back-attribution merge collapses
 * ALL of a device's anonymous sessions to the customer (via the durable
 * device_id), not just the checkout-time session. Default OFF — enable per
 * deployment after a smoke test, since it widens which prior events attribute
 * to a customer (a shared browser could over-merge).
 */
export function deviceStitchEnabled(): boolean {
  return process.env.ENABLE_DEVICE_STITCH === 'true'
}
