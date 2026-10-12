import { describe, it, expect } from 'vitest'
import { resolveTemplateVariables, type ProjectLike, type CustomerLike } from './templateContext.js'

const customer: CustomerLike = { id: 'c1', name: 'Priya', email: 'priya@example.com' }
const baseProject: ProjectLike = { id: 'p1', name: 'Lumière' }

function resolve(project: ProjectLike) {
  return resolveTemplateVariables({ variables: [], customer, project })
}

describe('brand kit tokens (Email Engine Step 2)', () => {
  it('falls back to neutral defaults + a wordmark header when no brand kit', () => {
    const out = resolve(baseProject)
    expect(out.brand_primary_color).toBe('#1f2937')
    expect(out.brand_accent).toBe('#4f46e5')
    expect(out.brand_logo).toBe('')
    expect(out.brand_header).toContain('Lumière')          // wordmark fallback
    expect(out.brand_header).not.toContain('<img')
  })

  it('uses the store brand colours and renders a logo header', () => {
    const out = resolve({
      ...baseProject,
      brandKit: { logoUrl: 'https://cdn.shop/logo.png', primaryColor: '#0a0a23', accentColor: '#e11d48', slogan: 'Quietly bold' },
    })
    expect(out.brand_primary_color).toBe('#0a0a23')
    expect(out.brand_accent).toBe('#e11d48')
    expect(out.brand_logo).toBe('https://cdn.shop/logo.png')
    expect(out.brand_header).toContain('<img src="https://cdn.shop/logo.png"')
    expect(out.brand_slogan).toBe('Quietly bold')
  })

  it('rejects a non-http logo url (no img, wordmark instead)', () => {
    const out = resolve({ ...baseProject, brandKit: { logoUrl: 'javascript:alert(1)' } })
    expect(out.brand_logo).toBe('')
    expect(out.brand_header).not.toContain('<img')
    expect(out.brand_header).toContain('Lumière')
  })

  it('escapes the store name in the header', () => {
    const out = resolve({ id: 'p1', name: 'A & <b>B</b>' })
    expect(out.brand_header).toContain('A &amp; &lt;b&gt;B&lt;/b&gt;')
    expect(out.brand_header).not.toContain('<b>B</b>')
  })

  it('treats empty-string brand colours as "use default"', () => {
    const out = resolve({ ...baseProject, brandKit: { primaryColor: '', accentColor: '' } })
    expect(out.brand_primary_color).toBe('#1f2937')
    expect(out.brand_accent).toBe('#4f46e5')
  })
})
