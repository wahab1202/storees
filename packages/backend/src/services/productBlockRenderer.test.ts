import { describe, it, expect } from 'vitest'
import {
  renderCartLineItems,
  renderProductGrid,
  normalizeLineItems,
  formatMoney,
  type RenderableProduct,
} from './productBlockRenderer.js'

describe('formatMoney', () => {
  it('defaults to INR (₹)', () => {
    expect(formatMoney('1290')).toBe('₹1,290.00')
  })
  it('formats other currencies by code', () => {
    expect(formatMoney(1290, 'USD')).toContain('$')
    expect(formatMoney(1290, 'GBP')).toContain('£')
  })
  it('falls back to INR for a bad currency code', () => {
    expect(formatMoney(100, 'nonsense')).toBe('₹100.00')
  })
  it('returns empty for null/unparseable', () => {
    expect(formatMoney(null)).toBe('')
    expect(formatMoney('abc')).toBe('')
  })
})

describe('renderProductGrid', () => {
  const products: RenderableProduct[] = [
    { title: 'Amara Hoop Earrings', price: '1290', imageUrl: 'https://cdn.shop/a.jpg', url: 'https://shop.co/a' },
    { title: 'Celeste Scrunchie', price: 1190.5, imageUrl: null, url: null },
  ]

  it('renders a card per product with title and formatted price', () => {
    const html = renderProductGrid(products)
    expect(html).toContain('Amara Hoop Earrings')
    expect(html).toContain('Celeste Scrunchie')
    expect(html).toContain('₹1,290.00')
    expect(html).toContain('₹1,190.50')
  })

  it('wraps a card in a link only when a valid http url is present', () => {
    const html = renderProductGrid(products)
    expect(html).toContain('href="https://shop.co/a"')
    // the second product has no url → no second anchor
    expect(html.match(/<a /g)?.length).toBe(1)
  })

  it('renders a placeholder tile when imageUrl is missing', () => {
    const html = renderProductGrid([{ title: 'No Image', price: 100 }])
    expect(html).not.toContain('<img')
    expect(html).toContain('background:#eef0f4')
  })

  it('pads an odd product count to keep the 2-up grid aligned', () => {
    const html = renderProductGrid([{ title: 'Solo', price: 10 }])
    // one filled cell + one empty filler cell
    expect(html.match(/class="mob-stack"/g)?.length).toBe(2)
  })

  it('returns empty string for no products (token collapses)', () => {
    expect(renderProductGrid([])).toBe('')
    expect(renderProductGrid([{ title: '', price: 1 }])).toBe('')
  })

  it('escapes HTML in titles so data cannot break the layout', () => {
    const html = renderProductGrid([{ title: '<b>x</b> & "y"', price: 5 }])
    expect(html).toContain('&lt;b&gt;x&lt;/b&gt; &amp; &quot;y&quot;')
    expect(html).not.toContain('<b>x</b>')
  })

  it('drops non-http image/url values (no javascript: injection)', () => {
    const html = renderProductGrid([{ title: 'Evil', imageUrl: 'javascript:alert(1)', url: 'javascript:alert(1)' }])
    expect(html).not.toContain('javascript:')
    expect(html).not.toContain('<a ')
    expect(html).not.toContain('<img')
  })
})

describe('renderCartLineItems', () => {
  it('renders name, variant·qty meta and price per item', () => {
    const html = renderCartLineItems([
      { name: 'Silk Scarf', variant: 'Midnight', quantity: 2, price: '990', imageUrl: 'https://cdn.shop/s.jpg' },
    ])
    expect(html).toContain('Silk Scarf')
    expect(html).toContain('Midnight · Qty 2')
    expect(html).toContain('₹990.00')
    expect(html).toContain('src="https://cdn.shop/s.jpg"')
  })

  it('omits the price cell when price is absent', () => {
    const html = renderCartLineItems([{ name: 'Mystery', quantity: 1 }])
    expect(html).toContain('Mystery')
    expect(html).not.toContain('₹')
  })

  it('returns empty string for no items', () => {
    expect(renderCartLineItems([])).toBe('')
  })
})

describe('normalizeLineItems', () => {
  it('reads canonical LineItem keys', () => {
    const out = normalizeLineItems([
      { productName: 'Hoop', quantity: 1, price: 1290, imageUrl: 'https://x/i.jpg' },
    ])
    expect(out).toEqual([
      { name: 'Hoop', quantity: 1, price: 1290, imageUrl: 'https://x/i.jpg', variant: null },
    ])
  })

  it('falls back to Shopify-style keys (title/image/variant_title)', () => {
    const out = normalizeLineItems([
      { title: 'Ring', qty: 3, price: '500', image: 'https://x/r.jpg', variant_title: 'Gold' },
    ])
    expect(out[0]).toMatchObject({ name: 'Ring', quantity: 3, imageUrl: 'https://x/r.jpg', variant: 'Gold' })
  })

  it('returns [] for non-array input', () => {
    expect(normalizeLineItems(undefined)).toEqual([])
    expect(normalizeLineItems('nope')).toEqual([])
  })
})
