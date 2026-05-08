import type { GmailAnnotation } from '@storees/shared'

function cleanString(value: unknown, max = 200): string | undefined {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  return trimmed ? trimmed.slice(0, max) : undefined
}

export function normalizeGmailAnnotation(value: unknown): GmailAnnotation | null {
  if (!value || typeof value !== 'object') return null
  const input = value as Record<string, unknown>
  const enabled = input.enabled === true
  if (!enabled) return null

  const annotation: GmailAnnotation = {
    enabled: true,
    imageUrl: cleanString(input.imageUrl, 500),
    dealText: cleanString(input.dealText, 80),
    description: cleanString(input.description, 120),
    offerCode: cleanString(input.offerCode, 80),
    startsAt: cleanString(input.startsAt, 40),
    expiresAt: cleanString(input.expiresAt, 40),
  }

  const hasContent = annotation.imageUrl || annotation.dealText || annotation.description || annotation.offerCode
  return hasContent ? annotation : null
}

export function injectGmailAnnotation(html: string, annotation: GmailAnnotation | null | undefined): string {
  if (!annotation?.enabled) return html

  const discountOffer: Record<string, string> = {
    '@type': 'DiscountOffer',
  }
  if (annotation.dealText) discountOffer.description = annotation.dealText
  if (annotation.offerCode) discountOffer.discountCode = annotation.offerCode
  if (annotation.startsAt) discountOffer.availabilityStarts = annotation.startsAt
  if (annotation.expiresAt) discountOffer.availabilityEnds = annotation.expiresAt

  const promotionCard: Record<string, unknown> = {
    '@type': 'PromotionCard',
  }
  if (annotation.imageUrl) promotionCard.image = annotation.imageUrl
  if (annotation.description) promotionCard.description = annotation.description
  if (Object.keys(discountOffer).length > 1) promotionCard.discountOffer = discountOffer

  const payload = {
    '@context': 'https://schema.org',
    '@type': 'EmailMessage',
    publisher: {
      '@type': 'Organization',
      name: 'Storees',
    },
    promotionCard,
  }
  const script = `<script type="application/ld+json">${JSON.stringify(payload)}</script>`
  return html.includes('</head>')
    ? html.replace('</head>', `${script}</head>`)
    : `${script}${html}`
}
