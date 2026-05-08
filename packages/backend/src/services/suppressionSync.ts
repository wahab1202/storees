export type SuppressionReason = 'hard_bounce' | 'complained' | 'unsubscribed' | 'manual'

/**
 * Phase 7 provider hook. Resend stays source-of-event today; SES/Postmark/Mailgun
 * can implement provider-side suppression mirroring here without changing the
 * webhook or unsubscribe paths again.
 */
export async function pushSuppressionToProvider(
  projectId: string,
  email: string,
  reason: SuppressionReason,
): Promise<void> {
  void projectId
  void email
  void reason
}
