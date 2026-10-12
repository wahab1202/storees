import { describe, it, expect } from 'vitest'
import { extractBrandFromHtml, fetchWebsiteBrand } from './websiteBrandFetcher.js'

const BASE = 'https://acme-lending.com/'

describe('extractBrandFromHtml', () => {
  it('reads og:image, theme-color and og:site_name', () => {
    const html = `<html><head>
      <meta property="og:site_name" content="Acme Lending"/>
      <meta property="og:image" content="https://cdn.acme.com/logo.png"/>
      <meta name="theme-color" content="#1d4ed8"/>
    </head><body><img src="/junk.png"/></body></html>`
    const b = extractBrandFromHtml(html, BASE)
    expect(b.name).toBe('Acme Lending')
    expect(b.logoUrl).toBe('https://cdn.acme.com/logo.png')
    expect(b.accentColor).toBe('#1d4ed8')
  })

  it('resolves a relative logo href against the page origin', () => {
    const html = `<head><link rel="apple-touch-icon" href="/assets/icon.png"/></head>`
    expect(extractBrandFromHtml(html, BASE).logoUrl).toBe('https://acme-lending.com/assets/icon.png')
  })

  it('falls back to favicon.ico when no logo tags are present', () => {
    const b = extractBrandFromHtml('<head><title>EduSpark</title></head>', BASE)
    expect(b.logoUrl).toBe('https://acme-lending.com/favicon.ico')
    expect(b.name).toBe('EduSpark')
  })

  it('rejects a non-hex theme-color (accent falls back later to default)', () => {
    const html = `<head><meta name="theme-color" content="rebeccapurple"/></head>`
    expect(extractBrandFromHtml(html, BASE).accentColor).toBeNull()
  })

  it('does not pull images from the body', () => {
    const html = `<head><title>X</title></head><body><meta property="og:image" content="https://evil/x.png"/></body>`
    expect(extractBrandFromHtml(html, BASE).logoUrl).toBe('https://acme-lending.com/favicon.ico')
  })

  it('decodes entities in the site name', () => {
    const html = `<head><title>Ed &amp; Tech</title></head>`
    expect(extractBrandFromHtml(html, BASE).name).toBe('Ed & Tech')
  })
})

describe('fetchWebsiteBrand SSRF guard', () => {
  it.each([
    'http://localhost/',
    'http://127.0.0.1/',
    'http://169.254.169.254/latest/meta-data/',
    'http://10.0.0.5/',
    'http://192.168.1.1/',
    'http://metadata.google.internal/',
    'ftp://example.com/',
  ])('refuses %s before any network call', async (url) => {
    await expect(fetchWebsiteBrand(url)).rejects.toThrow()
  })

  it('refuses an unparseable url', async () => {
    await expect(fetchWebsiteBrand('http://')).rejects.toThrow()
  })
})
