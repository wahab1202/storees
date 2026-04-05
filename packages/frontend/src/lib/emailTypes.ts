// ============ EMAIL BUILDER BLOCK TYPES ============

export type HeaderBlockProps = { text: string; level: 1 | 2 | 3; align: 'left' | 'center' | 'right'; color: string }
export type TextBlockProps = { html: string; align: 'left' | 'center' | 'right'; color: string; fontSize: number }
export type ImageBlockProps = { src: string; alt: string; width: string; link?: string; align: 'left' | 'center' | 'right' }
export type ButtonBlockProps = { text: string; url: string; bgColor: string; textColor: string; align: 'left' | 'center' | 'right'; borderRadius: number; fullWidth: boolean }
export type DividerBlockProps = { color: string; thickness: number; padding: number }
export type SpacerBlockProps = { height: number }
export type ColumnsBlockProps = { columns: EmailBlock[][]; ratio: '1:1' | '1:2' | '2:1' | '1:1:1' | '1:2:1' }
export type ProductBlockProps = { productName: string; price: string; imageUrl: string; ctaUrl: string; ctaText: string; description?: string }
export type SocialBlockProps = { links: Array<{ platform: 'facebook' | 'twitter' | 'instagram' | 'linkedin' | 'youtube' | 'whatsapp'; url: string }>; align: 'left' | 'center' | 'right' }
export type FooterBlockProps = { text: string; unsubscribeText: string; align: 'center' | 'left' }

export type EmailBlock =
  | { id: string; type: 'header'; props: HeaderBlockProps }
  | { id: string; type: 'text'; props: TextBlockProps }
  | { id: string; type: 'image'; props: ImageBlockProps }
  | { id: string; type: 'button'; props: ButtonBlockProps }
  | { id: string; type: 'divider'; props: DividerBlockProps }
  | { id: string; type: 'spacer'; props: SpacerBlockProps }
  | { id: string; type: 'columns'; props: ColumnsBlockProps }
  | { id: string; type: 'product'; props: ProductBlockProps }
  | { id: string; type: 'social'; props: SocialBlockProps }
  | { id: string; type: 'footer'; props: FooterBlockProps }

export type EmailTemplate = {
  subject: string
  previewText: string
  blocks: EmailBlock[]
  globalStyles: {
    bgColor: string
    contentBgColor: string
    fontFamily: string
    maxWidth: number
  }
}

export type BlockType = EmailBlock['type']

// ============ BLOCK DEFAULTS ============

export const BLOCK_DEFAULTS: Record<BlockType, () => EmailBlock['props']> = {
  header: () => ({ text: 'Your headline here', level: 1, align: 'center', color: '#1a1a2e' }),
  text: () => ({ html: '<p>Write your message here. Use <strong>bold</strong> and <em>italic</em> for emphasis.</p>', align: 'left', color: '#374151', fontSize: 16 }),
  image: () => ({ src: '', alt: 'Image', width: '100%', align: 'center' }),
  button: () => ({ text: 'Click Here', url: 'https://', bgColor: '#4F46E5', textColor: '#ffffff', align: 'center', borderRadius: 8, fullWidth: false }),
  divider: () => ({ color: '#e5e7eb', thickness: 1, padding: 16 }),
  spacer: () => ({ height: 24 }),
  columns: () => ({ columns: [[], []], ratio: '1:1' as const }),
  product: () => ({ productName: 'Product Name', price: '₹999', imageUrl: '', ctaUrl: 'https://', ctaText: 'Buy Now', description: '' }),
  social: () => ({ links: [{ platform: 'facebook' as const, url: '' }, { platform: 'twitter' as const, url: '' }, { platform: 'instagram' as const, url: '' }], align: 'center' as const }),
  footer: () => ({ text: '© {{store_name}} · Powered by Storees', unsubscribeText: 'Unsubscribe', align: 'center' as const }),
}

export const BLOCK_LABELS: Record<BlockType, { label: string; icon: string; description: string }> = {
  header: { label: 'Heading', icon: 'Type', description: 'Title or section header' },
  text: { label: 'Text', icon: 'AlignLeft', description: 'Paragraph or rich text' },
  image: { label: 'Image', icon: 'Image', description: 'Full-width or inline image' },
  button: { label: 'Button', icon: 'MousePointerClick', description: 'Call-to-action button' },
  divider: { label: 'Divider', icon: 'Minus', description: 'Horizontal separator line' },
  spacer: { label: 'Spacer', icon: 'MoveVertical', description: 'Empty vertical space' },
  columns: { label: 'Columns', icon: 'Columns2', description: '2-3 column layout' },
  product: { label: 'Product', icon: 'ShoppingBag', description: 'Product card with image + CTA' },
  social: { label: 'Social', icon: 'Share2', description: 'Social media icon links' },
  footer: { label: 'Footer', icon: 'CreditCard', description: 'Footer with unsubscribe' },
}

export const DEFAULT_TEMPLATE: EmailTemplate = {
  subject: '',
  previewText: '',
  blocks: [],
  globalStyles: {
    bgColor: '#f0f0f5',
    contentBgColor: '#ffffff',
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif",
    maxWidth: 640,
  },
}

let blockIdCounter = 0
export function generateBlockId(): string {
  return `block_${Date.now()}_${++blockIdCounter}`
}
