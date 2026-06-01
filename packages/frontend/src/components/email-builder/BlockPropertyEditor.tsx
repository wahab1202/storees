'use client'

import { useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { withProject } from '@/lib/project'
import { cn } from '@/lib/utils'
import { NumberInput } from '@/components/ui/NumberInput'
import type { EmailBlock, EmailTemplate } from '@/lib/emailTypes'
import { BLOCK_DEFAULTS, BLOCK_LABELS, generateBlockId } from '@/lib/emailTypes'
import { useCampaignVariations, type CampaignVariation } from '@/hooks/useCampaignAi'

type Props = {
  block: EmailBlock | null
  onChange: (props: Record<string, unknown>) => void
  globalStyles: EmailTemplate['globalStyles']
  onGlobalStylesChange: (styles: Partial<EmailTemplate['globalStyles']>) => void
  selectedColumnChildId?: string | null
  aiContext?: {
    subject?: string
    previewText?: string
    fullHtml?: string
    campaignGoal?: string
  }
}

const inputClass = 'w-full h-8 px-2.5 text-xs border border-border rounded-md bg-white text-text-primary focus:outline-none focus:ring-1 focus:ring-border-focus'
const labelClass = 'block text-[11px] font-medium text-text-muted mb-1'
const selectClass = cn(inputClass, 'appearance-none')
const COLUMN_CHILD_TYPES = ['image', 'text', 'button', 'divider', 'spacer'] as const

type UploadedEmailImage = {
  url: string
  filename: string
  mime: string
  size: number
}

type RecentEmailImage = {
  url: string
  filename: string
  size: number
  uploadedAt: string
}

type AiRewriteMode = 'rewrite' | 'shorter' | 'longer' | 'friendlier' | 'premium' | 'urgent'

const AI_REWRITE_GOALS: Record<AiRewriteMode, string> = {
  rewrite: 'Rewrite this single email text block. Keep it concise and preserve mustache variables.',
  shorter: 'Make this email text block shorter. Preserve mustache variables and the core meaning.',
  longer: 'Expand this email text block with helpful detail. Preserve mustache variables.',
  friendlier: 'Rewrite this email text block in a warmer, friendlier tone. Preserve mustache variables.',
  premium: 'Rewrite this email text block in a polished premium brand tone. Preserve mustache variables.',
  urgent: 'Rewrite this email text block with ethical urgency and a clear reason to act now. Preserve mustache variables.',
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result ?? '').split(',').pop() ?? '')
    reader.onerror = () => reject(reader.error ?? new Error('Failed to read file'))
    reader.readAsDataURL(file)
  })
}

function ColorInput({ value, onChange, label }: { value: string; onChange: (v: string) => void; label: string }) {
  return (
    <div>
      <label className={labelClass}>{label}</label>
      <div className="flex items-center gap-2">
        <input type="color" value={value} onChange={e => onChange(e.target.value)} className="w-8 h-8 rounded border border-border cursor-pointer" />
        <input type="text" value={value} onChange={e => onChange(e.target.value)} className={cn(inputClass, 'flex-1 font-mono text-[11px]')} />
      </div>
    </div>
  )
}

function AlignSelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <label className={labelClass}>Alignment</label>
      <div className="flex gap-1">
        {(['left', 'center', 'right'] as const).map(a => (
          <button key={a} onClick={() => onChange(a)} className={cn('flex-1 py-1.5 text-xs rounded-md border transition-colors', value === a ? 'bg-accent text-white border-accent' : 'border-border text-text-muted hover:bg-surface')}>
            {a.charAt(0).toUpperCase() + a.slice(1)}
          </button>
        ))}
      </div>
    </div>
  )
}

function HtmlInput({
  label,
  value,
  onChange,
  rows = 4,
  aiTargetKey,
  aiLoading,
  aiVariations,
  onGenerateAi,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  rows?: number
  aiTargetKey?: string
  aiLoading?: boolean
  aiVariations?: CampaignVariation[]
  onGenerateAi?: (key: string, html: string, mode: AiRewriteMode) => void
}) {
  const ref = useRef<HTMLTextAreaElement | null>(null)
  const insert = (before: string, after = '', fallback = '') => {
    const el = ref.current
    if (!el) {
      onChange(`${value}${before}${fallback}${after}`)
      return
    }
    const start = el.selectionStart
    const end = el.selectionEnd
    const selected = value.slice(start, end) || fallback
    const next = `${value.slice(0, start)}${before}${selected}${after}${value.slice(end)}`
    onChange(next)
    window.requestAnimationFrame(() => {
      el.focus()
      const cursor = start + before.length + selected.length + after.length
      el.setSelectionRange(cursor, cursor)
    })
  }

  return (
    <div>
      <label className={labelClass}>{label}</label>
      <div className="mb-1 flex flex-wrap gap-1">
        <button type="button" onClick={() => insert('<strong>', '</strong>', 'bold text')} className="rounded border border-border px-2 py-1 text-[11px] font-bold text-text-secondary hover:border-accent hover:text-accent">B</button>
        <button type="button" onClick={() => insert('<em>', '</em>', 'italic text')} className="rounded border border-border px-2 py-1 text-[11px] italic text-text-secondary hover:border-accent hover:text-accent">I</button>
        <button type="button" onClick={() => insert('<a href=\"https://\">', '</a>', 'link text')} className="rounded border border-border px-2 py-1 text-[11px] text-text-secondary hover:border-accent hover:text-accent">Link</button>
        <button type="button" onClick={() => insert('<br/>')} className="rounded border border-border px-2 py-1 text-[11px] text-text-secondary hover:border-accent hover:text-accent">Break</button>
        <button type="button" onClick={() => insert('{{customer_name}}')} className="rounded border border-border px-2 py-1 text-[11px] text-text-secondary hover:border-accent hover:text-accent">Name</button>
        <button type="button" onClick={() => insert('{{store_name}}')} className="rounded border border-border px-2 py-1 text-[11px] text-text-secondary hover:border-accent hover:text-accent">Store</button>
        {aiTargetKey && onGenerateAi && (
          <button
            type="button"
            onClick={() => onGenerateAi(aiTargetKey, value, 'rewrite')}
            disabled={aiLoading}
            className="rounded border border-accent/30 px-2 py-1 text-[11px] font-medium text-accent hover:bg-accent/5 disabled:opacity-60"
          >
            {aiLoading ? 'Generating...' : 'AI Rewrite'}
          </button>
        )}
      </div>
      {aiTargetKey && onGenerateAi && (
        <div className="mb-1 flex flex-wrap gap-1">
          {([
            ['shorter', 'Shorter'],
            ['longer', 'Longer'],
            ['friendlier', 'Friendlier'],
            ['premium', 'Premium'],
            ['urgent', 'Urgent'],
          ] as const).map(([mode, label]) => (
            <button
              key={mode}
              type="button"
              onClick={() => onGenerateAi(aiTargetKey, value, mode)}
              disabled={aiLoading}
              className="rounded border border-border px-2 py-1 text-[11px] text-text-secondary hover:border-accent hover:text-accent disabled:opacity-60"
            >
              {label}
            </button>
          ))}
        </div>
      )}
      <textarea
        ref={ref}
        value={value}
        onChange={e => onChange(e.target.value)}
        rows={rows}
        className={cn(inputClass, 'h-auto py-2 text-xs font-mono resize-y')}
      />
      {aiVariations && aiVariations.length > 0 && (
        <div className="mt-2 space-y-1.5">
          {aiVariations.map((variation, idx) => (
            <div key={`${variation.tone}-${idx}`} className="rounded-md border border-border bg-surface/60 p-2">
              <div className="mb-1 flex items-center justify-between gap-2">
                <span className="text-[10px] font-semibold uppercase text-text-muted">{variation.tone || `Option ${idx + 1}`}</span>
                <button
                  type="button"
                  onClick={() => onChange(normalizeAiHtml(variation.body))}
                  className="text-[11px] font-medium text-accent hover:text-accent-hover"
                >
                  Apply
                </button>
              </div>
              <p className="line-clamp-3 text-[11px] leading-5 text-text-secondary">{stripHtml(variation.body)}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function stripHtml(value: string): string {
  return value.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()
}

function normalizeAiHtml(value: string): string {
  const trimmed = value.trim()
  if (!trimmed) return ''
  return /<\/?[a-z][\s\S]*>/i.test(trimmed) ? trimmed : `<p>${trimmed}</p>`
}

export function BlockPropertyEditor({ block, onChange, globalStyles, onGlobalStylesChange, selectedColumnChildId, aiContext }: Props) {
  const info = block ? BLOCK_LABELS[block.type] : null
  const [uploadingKey, setUploadingKey] = useState<string | null>(null)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [deletingImage, setDeletingImage] = useState<string | null>(null)
  const [aiTargetKey, setAiTargetKey] = useState<string | null>(null)
  const [aiResults, setAiResults] = useState<Record<string, CampaignVariation[]>>({})
  const aiVariations = useCampaignVariations()
  const recentImages = useQuery({
    queryKey: ['email-assets', 'images'],
    queryFn: () => api.get<RecentEmailImage[]>(withProject('/api/assets/email-images')),
  })

  const uploadImage = async (key: string, file: File | undefined, onUrl: (url: string) => void) => {
    if (!file) return
    setUploadError(null)
    setUploadingKey(key)
    try {
      const contentBase64 = await fileToBase64(file)
      const response = await api.post<UploadedEmailImage>(withProject('/api/assets/email-image'), {
        filename: file.name,
        mime: file.type,
        contentBase64,
      })
      onUrl(response.data.url)
      void recentImages.refetch()
    } catch (error) {
      setUploadError(error instanceof Error ? error.message : 'Failed to upload image')
    } finally {
      setUploadingKey(null)
    }
  }

  const generateTextVariations = (key: string, html: string, mode: AiRewriteMode) => {
    setAiTargetKey(key)
    const contextLines = [
      `Task: ${AI_REWRITE_GOALS[mode]}`,
      aiContext?.campaignGoal ? `Campaign goal: ${aiContext.campaignGoal}` : null,
      aiContext?.subject ? `Email subject: ${aiContext.subject}` : null,
      aiContext?.previewText ? `Preview text: ${aiContext.previewText}` : null,
      block ? `Selected block type: ${BLOCK_LABELS[block.type].label}` : null,
      aiContext?.fullHtml ? `Full email context HTML: ${aiContext.fullHtml.slice(0, 4000)}` : null,
      'Return copy only for the selected text block, not the full email.',
    ].filter(Boolean).join('\n')
    aiVariations.mutate(
      {
        channel: 'email',
        body: html || '<p>Write a concise marketing message for this email block.</p>',
        subject: aiContext?.subject,
        goal: contextLines,
        count: 3,
      },
      {
        onSuccess: response => {
          setAiResults(prev => ({ ...prev, [key]: response.data.variations }))
          setAiTargetKey(null)
        },
        onError: () => setAiTargetKey(null),
      },
    )
  }

  const RecentImagePicker = ({ onSelect }: { onSelect: (url: string) => void }) => {
    const images = recentImages.data?.data ?? []
    if (images.length === 0) return null
    const deleteImage = async (filename: string) => {
      setUploadError(null)
      setDeletingImage(filename)
      try {
        await api.delete<{ filename: string }>(withProject(`/api/assets/email-images/${encodeURIComponent(filename)}`))
        void recentImages.refetch()
      } catch (error) {
        setUploadError(error instanceof Error ? error.message : 'Failed to delete image')
      } finally {
        setDeletingImage(null)
      }
    }
    return (
      <div>
        <label className={labelClass}>Recent Uploads</label>
        <div className="grid grid-cols-4 gap-2">
          {images.slice(0, 8).map(image => (
            <div key={image.url} className="group relative aspect-square overflow-hidden rounded-md border border-border bg-surface hover:border-accent">
              <button
                type="button"
                onClick={() => onSelect(image.url)}
                className="h-full w-full"
                title={image.filename}
              >
                <img src={image.url} alt="" className="h-full w-full object-cover" />
              </button>
              <button
                type="button"
                onClick={() => deleteImage(image.filename)}
                disabled={deletingImage === image.filename}
                className="absolute right-1 top-1 hidden rounded bg-red-500 px-1.5 py-0.5 text-[10px] font-medium text-white shadow-sm group-hover:block disabled:opacity-60"
                title="Delete image"
              >
                {deletingImage === image.filename ? '...' : 'Delete'}
              </button>
            </div>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="p-4">
      <div className="text-xs font-semibold text-text-primary mb-4 pb-2 border-b border-border">
        {info ? `${info.label} Properties` : 'Email Settings'}
      </div>

      <div className="space-y-3">
        {!block && (
          <p className="text-xs text-text-muted">Select a block to edit its content, or use the style controls below.</p>
        )}

        {block?.type === 'header' && (
          <>
            <div><label className={labelClass}>Text</label><input type="text" value={block.props.text} onChange={e => onChange({ text: e.target.value })} className={inputClass} /></div>
            <div><label className={labelClass}>Level</label>
              <select value={block.props.level} onChange={e => onChange({ level: Number(e.target.value) })} className={selectClass}>
                <option value={1}>H1 — Large</option><option value={2}>H2 — Medium</option><option value={3}>H3 — Small</option>
              </select>
            </div>
            <AlignSelect value={block.props.align} onChange={v => onChange({ align: v })} />
            <ColorInput value={block.props.color} onChange={v => onChange({ color: v })} label="Text Color" />
          </>
        )}

        {block?.type === 'text' && (
          <>
            <HtmlInput
              label="Content"
              value={block.props.html}
              onChange={html => onChange({ html })}
              rows={5}
              aiTargetKey={block.id}
              aiLoading={aiTargetKey === block.id && aiVariations.isPending}
              aiVariations={aiResults[block.id]}
              onGenerateAi={generateTextVariations}
            />
            <div><label className={labelClass}>Font Size</label><NumberInput value={block.props.fontSize} onChange={n => onChange({ fontSize: n ?? 14 })} min={10} max={32} className={inputClass} /></div>
            <AlignSelect value={block.props.align} onChange={v => onChange({ align: v })} />
            <ColorInput value={block.props.color} onChange={v => onChange({ color: v })} label="Text Color" />
          </>
        )}

        {block?.type === 'image' && (
          <>
            <div>
              <label className={labelClass}>Upload Image</label>
              <input
                type="file"
                accept="image/png,image/jpeg,image/gif,image/webp"
                onChange={e => uploadImage(block.id, e.target.files?.[0], url => onChange({ src: url }))}
                className="block w-full text-xs text-text-secondary file:mr-3 file:rounded-md file:border file:border-border file:bg-white file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-text-primary hover:file:border-accent"
              />
              {uploadingKey === block.id && <p className="mt-1 text-[10px] text-text-muted">Uploading...</p>}
            </div>
            <div><label className={labelClass}>Image URL</label><input type="text" value={block.props.src} onChange={e => onChange({ src: e.target.value })} placeholder="https://..." className={inputClass} /></div>
            <RecentImagePicker onSelect={url => onChange({ src: url })} />
            <div><label className={labelClass}>Alt Text</label><input type="text" value={block.props.alt} onChange={e => onChange({ alt: e.target.value })} className={inputClass} /></div>
            <div><label className={labelClass}>Width</label><input type="text" value={block.props.width} onChange={e => onChange({ width: e.target.value })} placeholder="100% or 300px" className={inputClass} /></div>
            <div><label className={labelClass}>Link URL (optional)</label><input type="text" value={block.props.link ?? ''} onChange={e => onChange({ link: e.target.value || undefined })} placeholder="https://..." className={inputClass} /></div>
            <AlignSelect value={block.props.align} onChange={v => onChange({ align: v })} />
            <div className="flex items-center gap-2">
              <input type="checkbox" id={`mobile-${block.id}`} checked={block.props.fullWidthOnMobile ?? true} onChange={e => onChange({ fullWidthOnMobile: e.target.checked })} className="rounded" />
              <label htmlFor={`mobile-${block.id}`} className="text-xs text-text-primary">Full width on mobile</label>
            </div>
          </>
        )}

        {block?.type === 'button' && (
          <>
            <div><label className={labelClass}>Button Text</label><input type="text" value={block.props.text} onChange={e => onChange({ text: e.target.value })} className={inputClass} /></div>
            <div><label className={labelClass}>URL</label><input type="text" value={block.props.url} onChange={e => onChange({ url: e.target.value })} placeholder="https://..." className={inputClass} /></div>
            <ColorInput value={block.props.bgColor} onChange={v => onChange({ bgColor: v })} label="Background Color" />
            <ColorInput value={block.props.textColor} onChange={v => onChange({ textColor: v })} label="Text Color" />
            <div><label className={labelClass}>Border Radius</label><input type="range" min={0} max={24} value={block.props.borderRadius} onChange={e => onChange({ borderRadius: Number(e.target.value) })} className="w-full" /><span className="text-[10px] text-text-muted">{block.props.borderRadius}px</span></div>
            <div><label className={labelClass}>Horizontal Padding</label><input type="range" min={12} max={56} value={block.props.paddingX ?? 32} onChange={e => onChange({ paddingX: Number(e.target.value) })} className="w-full" /><span className="text-[10px] text-text-muted">{block.props.paddingX ?? 32}px</span></div>
            <div><label className={labelClass}>Vertical Padding</label><input type="range" min={8} max={28} value={block.props.paddingY ?? 14} onChange={e => onChange({ paddingY: Number(e.target.value) })} className="w-full" /><span className="text-[10px] text-text-muted">{block.props.paddingY ?? 14}px</span></div>
            <AlignSelect value={block.props.align} onChange={v => onChange({ align: v })} />
            <div className="flex items-center gap-2">
              <input type="checkbox" id="fullWidth" checked={block.props.fullWidth} onChange={e => onChange({ fullWidth: e.target.checked })} className="rounded" />
              <label htmlFor="fullWidth" className="text-xs text-text-primary">Full width</label>
            </div>
            <div className="flex items-center gap-2">
              <input type="checkbox" id={`buttonMobile-${block.id}`} checked={block.props.fullWidthOnMobile ?? false} onChange={e => onChange({ fullWidthOnMobile: e.target.checked })} className="rounded" />
              <label htmlFor={`buttonMobile-${block.id}`} className="text-xs text-text-primary">Full width on mobile</label>
            </div>
          </>
        )}

        {block?.type === 'divider' && (
          <>
            <ColorInput value={block.props.color} onChange={v => onChange({ color: v })} label="Line Color" />
            <div><label className={labelClass}>Thickness</label><NumberInput value={block.props.thickness} onChange={n => onChange({ thickness: n ?? 1 })} min={1} max={8} className={inputClass} /></div>
            <div><label className={labelClass}>Padding</label><NumberInput value={block.props.padding} onChange={n => onChange({ padding: n ?? 0 })} min={0} max={48} className={inputClass} /></div>
          </>
        )}

        {block?.type === 'spacer' && (
          <div>
            <label className={labelClass}>Height</label>
            <input type="range" min={4} max={80} value={block.props.height} onChange={e => onChange({ height: Number(e.target.value) })} className="w-full" />
            <span className="text-[10px] text-text-muted">{block.props.height}px</span>
          </div>
        )}

        {block?.type === 'product' && (
          <>
            <div><label className={labelClass}>Product Name</label><input type="text" value={block.props.productName} onChange={e => onChange({ productName: e.target.value })} className={inputClass} /></div>
            <div><label className={labelClass}>Price</label><input type="text" value={block.props.price} onChange={e => onChange({ price: e.target.value })} className={inputClass} /></div>
            <div>
              <label className={labelClass}>Upload Image</label>
              <input
                type="file"
                accept="image/png,image/jpeg,image/gif,image/webp"
                onChange={e => uploadImage(block.id, e.target.files?.[0], url => onChange({ imageUrl: url }))}
                className="block w-full text-xs text-text-secondary file:mr-3 file:rounded-md file:border file:border-border file:bg-white file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-text-primary hover:file:border-accent"
              />
              {uploadingKey === block.id && <p className="mt-1 text-[10px] text-text-muted">Uploading...</p>}
            </div>
            <div><label className={labelClass}>Image URL</label><input type="text" value={block.props.imageUrl} onChange={e => onChange({ imageUrl: e.target.value })} placeholder="https://..." className={inputClass} /></div>
            <RecentImagePicker onSelect={url => onChange({ imageUrl: url })} />
            <div><label className={labelClass}>Description</label><input type="text" value={block.props.description ?? ''} onChange={e => onChange({ description: e.target.value })} className={inputClass} /></div>
            <div><label className={labelClass}>CTA Text</label><input type="text" value={block.props.ctaText} onChange={e => onChange({ ctaText: e.target.value })} className={inputClass} /></div>
            <div><label className={labelClass}>CTA URL</label><input type="text" value={block.props.ctaUrl} onChange={e => onChange({ ctaUrl: e.target.value })} placeholder="https://..." className={inputClass} /></div>
          </>
        )}

        {block?.type === 'social' && (
          <>
            <AlignSelect value={block.props.align} onChange={v => onChange({ align: v })} />
            {block.props.links.map((link, i) => (
              <div key={i} className="flex gap-2">
                <select value={link.platform} onChange={e => {
                  const links = [...block.props.links]; links[i] = { ...links[i], platform: e.target.value as typeof link.platform }; onChange({ links })
                }} className={cn(selectClass, 'w-24')}>
                  {['facebook', 'twitter', 'instagram', 'linkedin', 'youtube', 'whatsapp'].map(p => <option key={p} value={p}>{p}</option>)}
                </select>
                <input type="text" value={link.url} onChange={e => {
                  const links = [...block.props.links]; links[i] = { ...links[i], url: e.target.value }; onChange({ links })
                }} placeholder="URL" className={cn(inputClass, 'flex-1')} />
              </div>
            ))}
            <button onClick={() => onChange({ links: [...block.props.links, { platform: 'facebook', url: '' }] })} className="text-xs text-accent hover:text-accent/80 font-medium">+ Add link</button>
          </>
        )}

        {block?.type === 'footer' && (
          <>
            <div><label className={labelClass}>Footer Text</label><input type="text" value={block.props.text} onChange={e => onChange({ text: e.target.value })} className={inputClass} /></div>
            <div><label className={labelClass}>Unsubscribe Text</label><input type="text" value={block.props.unsubscribeText} onChange={e => onChange({ unsubscribeText: e.target.value })} className={inputClass} /></div>
          </>
        )}

        {block?.type === 'columns' && (
          <div>
            <label className={labelClass}>Column Ratio</label>
            <select value={block.props.ratio} onChange={e => {
              const ratio = e.target.value
              const colCount = ratio.split(':').length
              const columns = [...block.props.columns]
              while (columns.length < colCount) columns.push([])
              while (columns.length > colCount) columns.pop()
              onChange({ ratio, columns })
            }} className={selectClass}>
              <option value="1:1">50% / 50%</option>
              <option value="1:2">33% / 67%</option>
              <option value="2:1">67% / 33%</option>
              <option value="1:1:1">33% / 33% / 33%</option>
              <option value="1:2:1">25% / 50% / 25%</option>
              <option value="1:1:1:1">25% / 25% / 25% / 25%</option>
            </select>
            <div className="mt-4 rounded-lg border border-border bg-white p-3">
              <div className="mb-3 text-[11px] font-semibold uppercase text-text-muted">Row Properties</div>
              <div className="space-y-3">
                <div>
                  <label className={labelClass}>Padding</label>
                  <input type="range" min={0} max={48} value={block.props.padding ?? 8} onChange={e => onChange({ padding: Number(e.target.value) })} className="w-full" />
                  <span className="text-[10px] text-text-muted">{block.props.padding ?? 8}px</span>
                </div>
                <div>
                  <label className={labelClass}>Column Gap</label>
                  <input type="range" min={0} max={40} value={block.props.gap ?? 16} onChange={e => onChange({ gap: Number(e.target.value) })} className="w-full" />
                  <span className="text-[10px] text-text-muted">{block.props.gap ?? 16}px</span>
                </div>
                <div>
                  <label className={labelClass}>Row Background</label>
                  <input value={block.props.rowBgColor ?? 'transparent'} onChange={e => onChange({ rowBgColor: e.target.value })} placeholder="transparent or #F8FAFC" className={inputClass} />
                </div>
                <div>
                  <label className={labelClass}>Content Background</label>
                  <input value={block.props.contentBgColor ?? 'transparent'} onChange={e => onChange({ contentBgColor: e.target.value })} placeholder="transparent or #FFFFFF" className={inputClass} />
                </div>
                <div className="grid grid-cols-[minmax(0,1fr)_88px] gap-2">
                  <div>
                    <label className={labelClass}>Border Color</label>
                    <input value={block.props.borderColor ?? 'transparent'} onChange={e => onChange({ borderColor: e.target.value })} placeholder="transparent or #E5E7EB" className={inputClass} />
                  </div>
                  <div>
                    <label className={labelClass}>Border</label>
                    <NumberInput min={0} max={8} value={block.props.borderWidth ?? 0} onChange={n => onChange({ borderWidth: n ?? 0 })} className={inputClass} />
                  </div>
                </div>
                <div>
                  <label className={labelClass}>Rounded Corners</label>
                  <input type="range" min={0} max={24} value={block.props.borderRadius ?? 0} onChange={e => onChange({ borderRadius: Number(e.target.value) })} className="w-full" />
                  <span className="text-[10px] text-text-muted">{block.props.borderRadius ?? 0}px</span>
                </div>
                <div className="flex items-center gap-2">
                  <input type="checkbox" id={`stack-${block.id}`} checked={block.props.stackOnMobile !== false} onChange={e => onChange({ stackOnMobile: e.target.checked })} className="rounded" />
                  <label htmlFor={`stack-${block.id}`} className="text-xs text-text-primary">Stack columns on mobile</label>
                </div>
              </div>
            </div>
            <div className="mt-4 space-y-4">
              {block.props.columns.map((column, columnIndex) => {
                const heading = column.find(child => child.type === 'header')
                const image = column.find(child => child.type === 'image')
                const text = column.find(child => child.type === 'text')
                const button = column.find(child => child.type === 'button')
                const headingText = heading?.type === 'header' ? heading.props.text : ''
                const imageUrl = image?.type === 'image' ? image.props.src : ''
                const imageAlt = image?.type === 'image' ? image.props.alt : ''
                const bodyHtml = text?.type === 'text' ? text.props.html : ''
                const buttonText = button?.type === 'button' ? button.props.text : ''
                const buttonUrl = button?.type === 'button' ? button.props.url : ''
                const updateColumn = (next: { headingText?: string; imageUrl?: string; imageAlt?: string; bodyHtml?: string; buttonText?: string; buttonUrl?: string }) => {
                  const columns = block.props.columns.map((col, idx) => {
                    if (idx !== columnIndex) return col
                    return col.map(child => {
                      if (child.type === 'header' && next.headingText !== undefined) {
                        return { ...child, props: { ...child.props, text: next.headingText } }
                      }
                      if (child.type === 'image') {
                        return {
                          ...child,
                          props: {
                            ...child.props,
                            ...(next.imageUrl !== undefined ? { src: next.imageUrl } : {}),
                            ...(next.imageAlt !== undefined ? { alt: next.imageAlt } : {}),
                          },
                        }
                      }
                      if (child.type === 'text' && next.bodyHtml !== undefined) {
                        return { ...child, props: { ...child.props, html: next.bodyHtml } }
                      }
                      if (child.type === 'button') {
                        return {
                          ...child,
                          props: {
                            ...child.props,
                            ...(next.buttonText !== undefined ? { text: next.buttonText } : {}),
                            ...(next.buttonUrl !== undefined ? { url: next.buttonUrl } : {}),
                          },
                        }
                      }
                      return child
                    })
                  })
                  onChange({ columns })
                }
                const addColumnChild = (type: typeof COLUMN_CHILD_TYPES[number]) => {
                  const child = { id: generateBlockId(), type, props: BLOCK_DEFAULTS[type]() } as EmailBlock
                  const columns = block.props.columns.map((col, idx) => idx === columnIndex ? [...col, child] : col)
                  onChange({ columns })
                }
                const removeColumnChild = (childId: string) => {
                  const columns = block.props.columns.map((col, idx) => idx === columnIndex ? col.filter(child => child.id !== childId) : col)
                  onChange({ columns })
                }
                const duplicateColumnChild = (childId: string) => {
                  const columns = block.props.columns.map((col, idx) => {
                    if (idx !== columnIndex) return col
                    const childIndex = col.findIndex(child => child.id === childId)
                    if (childIndex < 0) return col
                    const original = col[childIndex]
                    const copy = { ...original, id: generateBlockId(), props: { ...original.props } } as EmailBlock
                    const next = [...col]
                    next.splice(childIndex + 1, 0, copy)
                    return next
                  })
                  onChange({ columns })
                }
                const updateColumnChild = (childId: string, props: Record<string, unknown>) => {
                  const columns = block.props.columns.map((col, idx) => {
                    if (idx !== columnIndex) return col
                    return col.map(child => child.id === childId ? { ...child, props: { ...child.props, ...props } } as EmailBlock : child)
                  })
                  onChange({ columns })
                }
                const moveColumnChild = (childId: string, direction: -1 | 1) => {
                  const columns = block.props.columns.map((col, idx) => {
                    if (idx !== columnIndex) return col
                    const childIndex = col.findIndex(child => child.id === childId)
                    const nextIndex = childIndex + direction
                    if (childIndex < 0 || nextIndex < 0 || nextIndex >= col.length) return col
                    const next = [...col]
                    ;[next[childIndex], next[nextIndex]] = [next[nextIndex], next[childIndex]]
                    return next
                  })
                  onChange({ columns })
                }

                return (
                  <div key={columnIndex} className="rounded-lg border border-border bg-surface/50 p-3 space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <div className="text-[10px] font-semibold uppercase text-text-muted">Column {columnIndex + 1}</div>
                      <div className="text-[10px] text-text-muted">{column.length} block{column.length === 1 ? '' : 's'}</div>
                    </div>
                    <div>
                      <label className={labelClass}>Heading</label>
                      <input value={headingText} onChange={e => updateColumn({ headingText: e.target.value })} className={inputClass} />
                    </div>
                    {image && (
                      <>
                        <div>
                          <label className={labelClass}>Image URL</label>
                          <input value={imageUrl} onChange={e => updateColumn({ imageUrl: e.target.value })} placeholder="https://..." className={inputClass} />
                        </div>
                        <div>
                          <label className={labelClass}>Image Alt Text</label>
                          <input value={imageAlt} onChange={e => updateColumn({ imageAlt: e.target.value })} className={inputClass} />
                        </div>
                      </>
                    )}
                    <div>
                      <HtmlInput
                        label="Body"
                        value={bodyHtml}
                        onChange={bodyHtml => updateColumn({ bodyHtml })}
                        rows={3}
                        aiTargetKey={`${block.id}:column:${columnIndex}:summary`}
                        aiLoading={aiTargetKey === `${block.id}:column:${columnIndex}:summary` && aiVariations.isPending}
                        aiVariations={aiResults[`${block.id}:column:${columnIndex}:summary`]}
                        onGenerateAi={generateTextVariations}
                      />
                    </div>
                    {button && (
                      <div className="grid grid-cols-1 gap-2">
                        <div>
                          <label className={labelClass}>Button Text</label>
                          <input value={buttonText} onChange={e => updateColumn({ buttonText: e.target.value })} className={inputClass} />
                        </div>
                        <div>
                          <label className={labelClass}>Button URL</label>
                          <input value={buttonUrl} onChange={e => updateColumn({ buttonUrl: e.target.value })} placeholder="https://..." className={inputClass} />
                        </div>
                      </div>
                    )}
                    <div className="rounded-md border border-border bg-white p-2">
                      <div className="mb-2 flex items-center justify-between gap-2">
                        <span className="text-[10px] font-semibold uppercase text-text-muted">Add content</span>
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {COLUMN_CHILD_TYPES.map(type => (
                          <button
                            key={type}
                            type="button"
                            onClick={() => addColumnChild(type)}
                            className="rounded-md border border-border px-2 py-1 text-[11px] font-medium text-text-secondary hover:border-accent hover:text-accent"
                          >
                            {BLOCK_LABELS[type].label}
                          </button>
                        ))}
                      </div>
                    </div>
                    {column.length > 0 && (
                      <div className="space-y-2">
                        {column.map((child, childIndex) => {
                          const childSelected = selectedColumnChildId === child.id
                          return (
                          <div key={child.id} className={cn('rounded-md border bg-white p-2', childSelected ? 'border-accent ring-1 ring-accent/20' : 'border-border')}>
                            <div className="mb-2 flex items-center justify-between gap-2">
                              <span className="text-[11px] font-medium text-text-secondary">
                                {childIndex + 1}. {BLOCK_LABELS[child.type].label}
                                {childSelected && <span className="ml-2 rounded bg-accent/10 px-1.5 py-0.5 text-[10px] text-accent">Selected</span>}
                              </span>
                              <span className="flex items-center gap-1">
                                <button type="button" onClick={() => moveColumnChild(child.id, -1)} disabled={childIndex === 0} className="rounded border border-border px-1.5 py-0.5 text-[10px] font-medium text-text-muted hover:text-text-primary disabled:opacity-40">Up</button>
                                <button type="button" onClick={() => moveColumnChild(child.id, 1)} disabled={childIndex === column.length - 1} className="rounded border border-border px-1.5 py-0.5 text-[10px] font-medium text-text-muted hover:text-text-primary disabled:opacity-40">Down</button>
                                <button type="button" onClick={() => duplicateColumnChild(child.id)} className="rounded border border-border px-1.5 py-0.5 text-[10px] font-medium text-text-muted hover:text-text-primary">Duplicate</button>
                                <button type="button" onClick={() => removeColumnChild(child.id)} className="rounded border border-red-100 px-1.5 py-0.5 text-[10px] font-medium text-red-500 hover:text-red-600">Remove</button>
                              </span>
                            </div>
                            {child.type === 'image' && (
                              <div className="space-y-2">
                                <div>
                                  <label className={labelClass}>Upload Image</label>
                                  <input
                                    type="file"
                                    accept="image/png,image/jpeg,image/gif,image/webp"
                                    onChange={e => uploadImage(child.id, e.target.files?.[0], url => updateColumnChild(child.id, { src: url }))}
                                    className="block w-full text-xs text-text-secondary file:mr-3 file:rounded-md file:border file:border-border file:bg-white file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-text-primary hover:file:border-accent"
                                  />
                                  {uploadingKey === child.id && <p className="mt-1 text-[10px] text-text-muted">Uploading...</p>}
                                </div>
                                <div>
                                  <label className={labelClass}>Image URL</label>
                                  <input value={child.props.src} onChange={e => updateColumnChild(child.id, { src: e.target.value })} placeholder="https://..." className={inputClass} />
                                </div>
                                <RecentImagePicker onSelect={url => updateColumnChild(child.id, { src: url })} />
                                <div>
                                  <label className={labelClass}>Alt Text</label>
                                  <input value={child.props.alt} onChange={e => updateColumnChild(child.id, { alt: e.target.value })} className={inputClass} />
                                </div>
                                <div>
                                  <label className={labelClass}>Width</label>
                                  <input value={child.props.width} onChange={e => updateColumnChild(child.id, { width: e.target.value })} placeholder="100% or 240px" className={inputClass} />
                                </div>
                                <div>
                                  <label className={labelClass}>Link URL (optional)</label>
                                  <input value={child.props.link ?? ''} onChange={e => updateColumnChild(child.id, { link: e.target.value || undefined })} placeholder="https://..." className={inputClass} />
                                </div>
                                <AlignSelect value={child.props.align} onChange={v => updateColumnChild(child.id, { align: v })} />
                                <div className="flex items-center gap-2">
                                  <input type="checkbox" id={`childMobile-${child.id}`} checked={child.props.fullWidthOnMobile ?? true} onChange={e => updateColumnChild(child.id, { fullWidthOnMobile: e.target.checked })} className="rounded" />
                                  <label htmlFor={`childMobile-${child.id}`} className="text-xs text-text-primary">Full width on mobile</label>
                                </div>
                              </div>
                            )}
                            {child.type === 'header' && (
                              <div>
                                <label className={labelClass}>Heading</label>
                                <input value={child.props.text} onChange={e => updateColumnChild(child.id, { text: e.target.value })} className={inputClass} />
                              </div>
                            )}
                            {child.type === 'text' && (
                              <div className="space-y-2">
                                <div>
                                  <HtmlInput
                                    label="Body"
                                    value={child.props.html}
                                    onChange={html => updateColumnChild(child.id, { html })}
                                    rows={3}
                                    aiTargetKey={child.id}
                                    aiLoading={aiTargetKey === child.id && aiVariations.isPending}
                                    aiVariations={aiResults[child.id]}
                                    onGenerateAi={generateTextVariations}
                                  />
                                </div>
                                <div>
                                  <label className={labelClass}>Font Size</label>
                                  <NumberInput value={child.props.fontSize} onChange={n => updateColumnChild(child.id, { fontSize: n ?? 14 })} min={10} max={32} className={inputClass} />
                                </div>
                                <AlignSelect value={child.props.align} onChange={v => updateColumnChild(child.id, { align: v })} />
                                <ColorInput value={child.props.color} onChange={v => updateColumnChild(child.id, { color: v })} label="Text Color" />
                              </div>
                            )}
                            {child.type === 'button' && (
                              <div className="space-y-2">
                                <div>
                                  <label className={labelClass}>Button Text</label>
                                  <input value={child.props.text} onChange={e => updateColumnChild(child.id, { text: e.target.value })} className={inputClass} />
                                </div>
                                <div>
                                  <label className={labelClass}>Button URL</label>
                                  <input value={child.props.url} onChange={e => updateColumnChild(child.id, { url: e.target.value })} placeholder="https://..." className={inputClass} />
                                </div>
                                <ColorInput value={child.props.bgColor} onChange={v => updateColumnChild(child.id, { bgColor: v })} label="Background Color" />
                                <ColorInput value={child.props.textColor} onChange={v => updateColumnChild(child.id, { textColor: v })} label="Text Color" />
                                <div>
                                  <label className={labelClass}>Border Radius</label>
                                  <input type="range" min={0} max={24} value={child.props.borderRadius} onChange={e => updateColumnChild(child.id, { borderRadius: Number(e.target.value) })} className="w-full" />
                                  <span className="text-[10px] text-text-muted">{child.props.borderRadius}px</span>
                                </div>
                                <div>
                                  <label className={labelClass}>Horizontal Padding</label>
                                  <input type="range" min={12} max={56} value={child.props.paddingX ?? 32} onChange={e => updateColumnChild(child.id, { paddingX: Number(e.target.value) })} className="w-full" />
                                  <span className="text-[10px] text-text-muted">{child.props.paddingX ?? 32}px</span>
                                </div>
                                <div>
                                  <label className={labelClass}>Vertical Padding</label>
                                  <input type="range" min={8} max={28} value={child.props.paddingY ?? 14} onChange={e => updateColumnChild(child.id, { paddingY: Number(e.target.value) })} className="w-full" />
                                  <span className="text-[10px] text-text-muted">{child.props.paddingY ?? 14}px</span>
                                </div>
                                <AlignSelect value={child.props.align} onChange={v => updateColumnChild(child.id, { align: v })} />
                                <div className="flex items-center gap-2">
                                  <input type="checkbox" id={`childButtonMobile-${child.id}`} checked={child.props.fullWidthOnMobile ?? false} onChange={e => updateColumnChild(child.id, { fullWidthOnMobile: e.target.checked })} className="rounded" />
                                  <label htmlFor={`childButtonMobile-${child.id}`} className="text-xs text-text-primary">Full width on mobile</label>
                                </div>
                              </div>
                            )}
                            {child.type === 'divider' && (
                              <div className="space-y-2">
                                <ColorInput value={child.props.color} onChange={v => updateColumnChild(child.id, { color: v })} label="Line Color" />
                                <div>
                                  <label className={labelClass}>Thickness</label>
                                  <NumberInput value={child.props.thickness} onChange={n => updateColumnChild(child.id, { thickness: n ?? 1 })} min={1} max={8} className={inputClass} />
                                </div>
                              </div>
                            )}
                            {child.type === 'spacer' && (
                              <div>
                                <label className={labelClass}>Height</label>
                                <input type="range" min={4} max={80} value={child.props.height} onChange={e => updateColumnChild(child.id, { height: Number(e.target.value) })} className="w-full" />
                                <span className="text-[10px] text-text-muted">{child.props.height}px</span>
                              </div>
                            )}
                          </div>
                        )})}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* Global Styles (always shown at bottom) */}
        <div className="pt-3 mt-3 border-t border-border">
          <div className="text-[11px] font-semibold text-text-muted mb-2">Email Styles</div>
          {uploadError && <div className="mb-3 rounded-md border border-red-100 bg-red-50 px-3 py-2 text-xs text-red-600">{uploadError}</div>}
          <div className="space-y-3">
            <ColorInput value={globalStyles.bgColor} onChange={v => onGlobalStylesChange({ bgColor: v })} label="Page Background" />
            <ColorInput value={globalStyles.contentBgColor} onChange={v => onGlobalStylesChange({ contentBgColor: v })} label="Content Background" />
          </div>
        </div>
      </div>
    </div>
  )
}
