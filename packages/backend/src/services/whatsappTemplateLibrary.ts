import type { TemplateVariable } from '@storees/shared'

/**
 * WhatsApp message content for the ecommerce journey templates (Step: message
 * templates). Authored in Meta positional-param format ({{1}}, {{2}}…) with the
 * category each stage requires, so installFlowTemplate can seed them as draft
 * rows the merchant submits for approval. Keyed by the flow send-node
 * templateId, so install links the flow to the created template's uuid.
 *
 * Params default to sensible CDP sources the merchant edits. Dynamic
 * {{recommended_product}} / {{social_proof}} in positional params is a follow-up
 * (needs a 'decision' variable source); email flows already resolve those live.
 */

export type WaTemplateDef = {
  category: 'MARKETING' | 'UTILITY'
  language: string
  bodyText: string
  parameterCount: number
  variables: TemplateVariable[]
  footer?: string
  buttons?: Array<{ type: 'URL'; text: string; url: string }>
}

const name: TemplateVariable = { key: '1', source: { kind: 'customer', field: 'name' }, defaultValue: 'there' }
const productParam = (n: string): TemplateVariable => ({ key: n, source: { kind: 'event', key: 'product_name' }, defaultValue: 'your pick' })
const literal = (n: string, value: string): TemplateVariable => ({ key: n, source: { kind: 'literal', value } })
const shopBtn = (text: string): WaTemplateDef['buttons'] => [{ type: 'URL', text, url: 'https://your-store.example/{{1}}' }]

export const WHATSAPP_FLOW_TEMPLATES: Record<string, WaTemplateDef> = {
  ecom_bestsellers: {
    category: 'MARKETING', language: 'en_US',
    bodyText: 'Hi {{1}}! 👋 Here are this month\'s most-loved picks, chosen by our community. Something for everyone — take a look.',
    parameterCount: 1, variables: [name], buttons: shopBtn('Shop Bestsellers'),
  },
  ecom_cart_nudge: {
    category: 'MARKETING', language: 'en_US',
    bodyText: 'Hi {{1}}, your {{2}} is saved in your cart 🛍️. Still deciding? It\'s waiting for you.',
    parameterCount: 2, variables: [name, productParam('2')], buttons: shopBtn('Resume Cart'),
  },
  ecom_cart_reminder: {
    category: 'UTILITY', language: 'en_US',
    bodyText: 'Hi {{1}}, you\'re just one step away from completing your order. Need help with delivery or payment? Just reply.',
    parameterCount: 1, variables: [name], buttons: shopBtn('Complete Order'),
  },
  ecom_browse_nudge: {
    category: 'MARKETING', language: 'en_US',
    bodyText: 'Hi {{1}}, still eyeing {{2}}? 👀 It\'s one of our most-loved picks this month. Not sure? We\'re here to help.',
    parameterCount: 2, variables: [name, productParam('2')], buttons: shopBtn('Take Another Look'),
  },
  ecom_thankyou: {
    category: 'UTILITY', language: 'en_US',
    bodyText: 'Thank you {{1}}! 🎉 Your order {{2}} is confirmed. We\'ll let you know the moment it ships. Need anything? Just reply.',
    parameterCount: 2, variables: [name, { key: '2', source: { kind: 'event', key: 'order_id' }, defaultValue: '' }],
    buttons: shopBtn('Track Order'),
  },
  ecom_payment_retry: {
    category: 'UTILITY', language: 'en_US',
    bodyText: 'Hi {{1}}, your payment didn\'t go through. No worries — you can finish your order securely here. Need help? Reply and we\'ll sort it.',
    parameterCount: 1, variables: [name], buttons: shopBtn('Complete Payment'),
  },
  ecom_reorder: {
    category: 'MARKETING', language: 'en_US',
    bodyText: 'Hi {{1}}, running low on {{2}}? 💫 Reorder in one tap — same favourite, delivered again.',
    parameterCount: 2, variables: [name, productParam('2')], buttons: shopBtn('Reorder Now'),
  },
  ecom_review_thanks: {
    category: 'MARKETING', language: 'en_US',
    bodyText: 'Hi {{1}}, thank you for your review 🌟 — it genuinely helps other shoppers. Here\'s a little something for your next order.',
    parameterCount: 1, variables: [name], buttons: shopBtn('Shop Again'),
  },
  ecom_winback_offer: {
    category: 'MARKETING', language: 'en_US',
    bodyText: 'We miss you, {{1}}! 💕 Here\'s {{2}} to welcome you back — and a few things we think you\'ll love.',
    parameterCount: 2, variables: [name, literal('2', 'a special offer')], buttons: shopBtn('Come Back'),
  },
  ecom_sub_offer: {
    category: 'MARKETING', language: 'en_US',
    bodyText: 'Hi {{1}}, we\'d love to have you back 💕. Here\'s {{2}} if you resubscribe — no pressure, just an open door.',
    parameterCount: 2, variables: [name, literal('2', 'a special offer')], buttons: shopBtn('Resubscribe'),
  },
}
