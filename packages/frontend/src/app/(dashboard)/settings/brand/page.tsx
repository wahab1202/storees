'use client'

import { useEffect, useState } from 'react'
import { PageHeader } from '@/components/layout/PageHeader'
import { useBrandKit, useSyncBrandKit, useUpdateBrandKit } from '@/hooks/useBrandKit'
import { Loader2, Store, Globe, Save } from 'lucide-react'
import { toast } from 'sonner'

const HEX = /^#[0-9a-fA-F]{3,8}$/
const inputClass = 'w-full h-10 px-3 text-sm border border-border rounded-lg bg-white text-text-primary focus:outline-none focus:ring-2 focus:ring-accent/20 focus:border-accent placeholder:text-text-muted'

export default function BrandSettingsPage() {
  const { data, isLoading } = useBrandKit()
  const sync = useSyncBrandKit()
  const update = useUpdateBrandKit()

  const [logoUrl, setLogoUrl] = useState('')
  const [primaryColor, setPrimaryColor] = useState('#1f2937')
  const [accentColor, setAccentColor] = useState('#4f46e5')
  const [slogan, setSlogan] = useState('')
  const [websiteUrl, setWebsiteUrl] = useState('')

  // Hydrate the form once the kit loads (effective values include defaults).
  useEffect(() => {
    const eff = data?.data?.effective
    const kit = data?.data?.kit
    if (!eff) return
    setLogoUrl(kit?.logoUrl ?? '')
    setPrimaryColor(eff.primaryColor)
    setAccentColor(eff.accentColor)
    setSlogan(kit?.slogan ?? '')
  }, [data])

  const source = data?.data?.kit?.source

  async function handleSyncShopify() {
    try {
      await sync.mutateAsync(undefined)
      toast.success('Brand synced from Shopify')
    } catch (err) {
      toast.error((err as Error).message || 'Could not sync from Shopify')
    }
  }

  async function handleScanWebsite() {
    if (!websiteUrl.trim()) return toast.error('Enter your website URL first')
    try {
      await sync.mutateAsync({ url: websiteUrl.trim() })
      toast.success('Brand detected from your website')
    } catch (err) {
      toast.error((err as Error).message || 'Could not read that website')
    }
  }

  async function handleSave() {
    if (primaryColor && !HEX.test(primaryColor)) return toast.error('Primary colour must be a hex like #1F2937')
    if (accentColor && !HEX.test(accentColor)) return toast.error('Accent colour must be a hex like #4F46E5')
    try {
      await update.mutateAsync({ logoUrl: logoUrl.trim() || null, primaryColor, accentColor, slogan: slogan.trim() || null })
      toast.success('Brand kit saved')
    } catch (err) {
      toast.error((err as Error).message || 'Failed to save')
    }
  }

  if (isLoading) {
    return <div className="flex items-center justify-center py-20 text-text-muted"><Loader2 className="h-5 w-5 animate-spin mr-2" />Loading brand kit…</div>
  }

  return (
    <div>
      <PageHeader
        title="Brand Kit"
        description="Your logo and colours are applied to every email automatically. Pull them from your store or website, or set them by hand."
      />

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-6">
        {/* Controls */}
        <div className="space-y-6">
          {/* Auto-detect */}
          <section className="border border-border rounded-xl p-5 bg-surface">
            <h3 className="text-sm font-semibold text-text-primary mb-1">Detect automatically</h3>
            <p className="text-xs text-text-muted mb-4">Pull your logo and colours from your connected store, or scan any website — works for any business, not just Shopify.</p>
            <div className="flex flex-col sm:flex-row gap-3">
              <button
                onClick={handleSyncShopify}
                disabled={sync.isPending}
                className="inline-flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium border border-border text-text-secondary rounded-lg hover:bg-background transition-colors disabled:opacity-50"
              >
                {sync.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Store className="h-4 w-4" />}
                Sync from Shopify
              </button>
            </div>
            <div className="flex flex-col sm:flex-row gap-2 mt-3">
              <div className="relative flex-1">
                <Globe className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-text-muted" />
                <input
                  value={websiteUrl}
                  onChange={e => setWebsiteUrl(e.target.value)}
                  placeholder="yourbrand.com"
                  className={inputClass + ' pl-9'}
                />
              </div>
              <button
                onClick={handleScanWebsite}
                disabled={sync.isPending}
                className="inline-flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium bg-accent text-white rounded-lg hover:bg-accent-hover transition-colors disabled:opacity-50 whitespace-nowrap"
              >
                Scan website
              </button>
            </div>
          </section>

          {/* Manual */}
          <section className="border border-border rounded-xl p-5 bg-surface">
            <h3 className="text-sm font-semibold text-text-primary mb-4">Or set it manually</h3>
            <div className="space-y-4">
              <label className="block">
                <span className="block text-xs font-medium text-text-secondary mb-1">Logo URL</span>
                <input value={logoUrl} onChange={e => setLogoUrl(e.target.value)} placeholder="https://…/logo.png" className={inputClass} />
              </label>
              <div className="grid grid-cols-2 gap-4">
                <ColorField label="Heading colour" value={primaryColor} onChange={setPrimaryColor} />
                <ColorField label="Accent colour (buttons)" value={accentColor} onChange={setAccentColor} />
              </div>
              <label className="block">
                <span className="block text-xs font-medium text-text-secondary mb-1">Slogan (optional)</span>
                <input value={slogan} onChange={e => setSlogan(e.target.value)} placeholder="Quietly bold" className={inputClass} />
              </label>
            </div>
            <div className="flex items-center gap-3 mt-5">
              <button
                onClick={handleSave}
                disabled={update.isPending}
                className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium bg-accent text-white rounded-lg hover:bg-accent-hover transition-colors disabled:opacity-50"
              >
                {update.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                Save brand kit
              </button>
              {source && <span className="text-xs text-text-muted">Last set via {source}</span>}
            </div>
          </section>
        </div>

        {/* Live preview */}
        <aside>
          <p className="text-xs font-medium text-text-muted uppercase tracking-wide mb-2">Preview</p>
          <div className="border border-border rounded-xl overflow-hidden bg-white">
            <div className="px-5 py-4 border-b border-border flex items-center min-h-[64px]">
              {logoUrl
                ? <img src={logoUrl} alt="logo" className="max-h-9" />
                : <span className="font-extrabold text-lg tracking-wide" style={{ color: primaryColor }}>YOUR BRAND</span>}
            </div>
            <div className="p-5 space-y-3">
              <h4 className="text-lg font-extrabold" style={{ color: primaryColor }}>A heading in your brand colour</h4>
              <p className="text-sm text-slate-500">This is how body copy sits under it.</p>
              <div className="flex items-center justify-between py-2 border-t border-slate-100">
                <span className="text-sm font-medium text-slate-800">Product name</span>
                <span className="text-sm font-bold" style={{ color: accentColor }}>₹1,290</span>
              </div>
              <a className="block text-center text-white text-sm font-bold rounded-lg py-3 no-underline" style={{ background: accentColor }}>Complete my order →</a>
            </div>
          </div>
        </aside>
      </div>
    </div>
  )
}

function ColorField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  const valid = HEX.test(value)
  return (
    <label className="block">
      <span className="block text-xs font-medium text-text-secondary mb-1">{label}</span>
      <div className="flex items-center gap-2">
        <input
          type="color"
          value={valid ? value : '#000000'}
          onChange={e => onChange(e.target.value)}
          className="h-10 w-12 rounded-lg border border-border bg-white cursor-pointer p-1"
          aria-label={`${label} swatch`}
        />
        <input value={value} onChange={e => onChange(e.target.value)} placeholder="#4F46E5" className={inputClass + ' font-mono'} />
      </div>
    </label>
  )
}
