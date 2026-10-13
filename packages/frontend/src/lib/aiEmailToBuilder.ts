import type { EmailBlock as AiBlock } from '@storees/shared'
import { DEFAULT_TEMPLATE, generateBlockId, type EmailBlock as BuilderBlock, type EmailTemplate } from '@/lib/emailTypes'

/**
 * Translate an AI layout (shared EmailBlock schema, Step 3) into the visual
 * builder's native blocks, so a generated email opens fully editable instead of
 * as one opaque HTML blob. Dynamic blocks (cart_items / product_grid) become a
 * text block holding the send-time token, which compiles straight through and is
 * filled by the pipeline at send. Brand accent is resolved to a literal colour
 * here because builder buttons take a colour, not a token.
 */

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

export function aiBlocksToBuilderTemplate(
  blocks: AiBlock[],
  opts: { subject: string; accent?: string },
): EmailTemplate {
  const accent = opts.accent && /^#[0-9a-fA-F]{3,8}$/.test(opts.accent) ? opts.accent : '#4F46E5'
  const out: BuilderBlock[] = []
  const text = (html: string, extra?: Partial<{ color: string; fontSize: number; align: 'left' | 'center' | 'right' }>): BuilderBlock => ({
    id: generateBlockId(), type: 'text',
    props: { html, align: extra?.align ?? 'left', color: extra?.color ?? '#374151', fontSize: extra?.fontSize ?? 16 },
  })

  for (const b of blocks) {
    switch (b.type) {
      case 'hero':
        out.push({ id: generateBlockId(), type: 'header', props: { text: b.heading, level: 1, align: 'left', color: '#111827' } })
        if (b.subheading) out.push(text(`<p>${esc(b.subheading)}</p>`, { color: '#6b7280' }))
        break
      case 'paragraph':
        out.push(text(`<p>${esc(b.text)}</p>`))
        break
      case 'button':
        out.push({
          id: generateBlockId(), type: 'button',
          props: { text: b.label, url: b.href, bgColor: accent, textColor: '#ffffff', align: 'center', borderRadius: 10, fullWidth: false },
        })
        break
      case 'discount':
        out.push(text(
          `<div style="border:2px dashed ${accent};border-radius:12px;padding:18px;text-align:center;">` +
          (b.text ? `<p style="margin:0 0 6px;font-size:13px;color:#6b7280;">${esc(b.text)}</p>` : '') +
          `<p style="margin:0;font-size:22px;font-weight:800;letter-spacing:2px;color:#111827;">${esc(b.code)}</p></div>`,
          { align: 'center' },
        ))
        break
      case 'divider':
        out.push({ id: generateBlockId(), type: 'divider', props: { color: '#e5e7eb', thickness: 1, padding: 20 } })
        break
      case 'spacer':
        out.push({ id: generateBlockId(), type: 'spacer', props: { height: 16 } })
        break
      case 'cart_items':
        // Send-time token — passes through compile, filled by the pipeline.
        out.push(text('{{cart_items}}'))
        break
      case 'product_grid':
        if (b.heading) out.push(text(`<p style="font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:#8a7a63;">${esc(b.heading)}</p>`))
        out.push(text('{{recommended_products}}'))
        break
      case 'footer_note':
        out.push(text(`<p style="font-size:12px;color:#9ca3af;">${esc(b.text)}</p>`, { fontSize: 12, color: '#9ca3af' }))
        break
    }
  }

  return {
    ...DEFAULT_TEMPLATE,
    subject: opts.subject,
    previewText: '',
    blocks: out,
    globalStyles: { ...DEFAULT_TEMPLATE.globalStyles },
  }
}
