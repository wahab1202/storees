import { describe, it, expect } from 'vitest'
import { renderBlocksToHtml } from './emailLayoutRenderer.js'
import { coerceBlocks } from './emailLayoutService.js'
import type { EmailBlock } from '@storees/shared'

describe('renderBlocksToHtml', () => {
  it('wraps blocks in a branded shell with brand + send-time tokens', () => {
    const html = renderBlocksToHtml([{ type: 'hero', heading: 'Welcome' }])
    expect(html).toContain('{{brand_header}}')
    expect(html).toContain('{{store_name}}')
    expect(html).toContain('{{unsubscribe_url}}')
    expect(html).toContain('color:{{brand_primary_color}}')
    expect(html).toContain('Welcome')
  })

  it('renders a button with the brand accent and a safe href', () => {
    const okToken = renderBlocksToHtml([{ type: 'button', label: 'Shop now', href: '{{cart_url}}' }])
    expect(okToken).toContain('background:{{brand_accent}}')
    expect(okToken).toContain('href="{{cart_url}}"')

    const https = renderBlocksToHtml([{ type: 'button', label: 'Go', href: 'https://x.co/a' }])
    expect(https).toContain('href="https://x.co/a"')

    const junk = renderBlocksToHtml([{ type: 'button', label: 'Go', href: 'javascript:alert(1)' }])
    expect(junk).toContain('href="{{store_url}}"')   // unsafe href falls back
    expect(junk).not.toContain('javascript:')
  })

  it('emits Step 1/2 tokens for dynamic blocks', () => {
    const html = renderBlocksToHtml([
      { type: 'cart_items' },
      { type: 'product_grid', heading: 'Picked for you' },
    ])
    expect(html).toContain('{{cart_items}}')
    expect(html).toContain('{{recommended_products}}')
    expect(html).toContain('Picked for you')
  })

  it('escapes copy so it cannot inject markup', () => {
    const html = renderBlocksToHtml([{ type: 'hero', heading: '<script>x</script>' }])
    expect(html).toContain('&lt;script&gt;')
    expect(html).not.toContain('<script>x</script>')
  })

  it('renders a discount coupon box', () => {
    const html = renderBlocksToHtml([{ type: 'discount', code: 'SAVE10', text: 'Just for you' }])
    expect(html).toContain('SAVE10')
    expect(html).toContain('Just for you')
    expect(html).toContain('dashed')
  })
})

describe('coerceBlocks', () => {
  it('keeps valid blocks and drops unknown types', () => {
    const raw = [
      { type: 'hero', heading: 'Hi' },
      { type: 'marquee', text: 'nope' },     // unknown → dropped
      { type: 'button', label: 'Go', href: '{{cart_url}}' },
    ]
    const out = coerceBlocks(raw)
    expect(out.map(b => b.type)).toEqual(['hero', 'button'])
  })

  it('drops blocks missing required fields', () => {
    const out = coerceBlocks([
      { type: 'hero' },                 // no heading → dropped
      { type: 'button' },               // no label → dropped
      { type: 'paragraph', text: '' },  // empty → dropped
    ])
    expect(out).toEqual([])
  })

  it('defaults a button href to {{store_url}} when missing', () => {
    const out = coerceBlocks([{ type: 'button', label: 'Go' }]) as EmailBlock[]
    expect(out[0]).toEqual({ type: 'button', label: 'Go', href: '{{store_url}}' })
  })

  it('caps the number of blocks', () => {
    const many = Array.from({ length: 30 }, () => ({ type: 'paragraph', text: 'x' }))
    expect(coerceBlocks(many).length).toBeLessThanOrEqual(14)
  })

  it('returns [] for non-array input', () => {
    expect(coerceBlocks(undefined)).toEqual([])
    expect(coerceBlocks('nope')).toEqual([])
  })
})
