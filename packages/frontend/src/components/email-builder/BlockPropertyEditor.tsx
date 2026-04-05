'use client'

import { cn } from '@/lib/utils'
import type { EmailBlock, EmailTemplate } from '@/lib/emailTypes'
import { BLOCK_LABELS } from '@/lib/emailTypes'

type Props = {
  block: EmailBlock
  onChange: (props: Record<string, unknown>) => void
  globalStyles: EmailTemplate['globalStyles']
  onGlobalStylesChange: (styles: Partial<EmailTemplate['globalStyles']>) => void
}

const inputClass = 'w-full h-8 px-2.5 text-xs border border-border rounded-md bg-white text-text-primary focus:outline-none focus:ring-1 focus:ring-border-focus'
const labelClass = 'block text-[11px] font-medium text-text-muted mb-1'
const selectClass = cn(inputClass, 'appearance-none')

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

export function BlockPropertyEditor({ block, onChange, globalStyles, onGlobalStylesChange }: Props) {
  const info = BLOCK_LABELS[block.type]

  return (
    <div className="p-4">
      <div className="text-xs font-semibold text-text-primary mb-4 pb-2 border-b border-border">
        {info.label} Properties
      </div>

      <div className="space-y-3">
        {block.type === 'header' && (
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

        {block.type === 'text' && (
          <>
            <div><label className={labelClass}>Content (HTML)</label>
              <textarea value={block.props.html} onChange={e => onChange({ html: e.target.value })} rows={5} className={cn(inputClass, 'h-auto py-2 text-xs font-mono resize-y')} />
            </div>
            <div><label className={labelClass}>Font Size</label><input type="number" value={block.props.fontSize} onChange={e => onChange({ fontSize: Number(e.target.value) })} min={10} max={32} className={inputClass} /></div>
            <AlignSelect value={block.props.align} onChange={v => onChange({ align: v })} />
            <ColorInput value={block.props.color} onChange={v => onChange({ color: v })} label="Text Color" />
          </>
        )}

        {block.type === 'image' && (
          <>
            <div><label className={labelClass}>Image URL</label><input type="text" value={block.props.src} onChange={e => onChange({ src: e.target.value })} placeholder="https://..." className={inputClass} /></div>
            <div><label className={labelClass}>Alt Text</label><input type="text" value={block.props.alt} onChange={e => onChange({ alt: e.target.value })} className={inputClass} /></div>
            <div><label className={labelClass}>Width</label><input type="text" value={block.props.width} onChange={e => onChange({ width: e.target.value })} placeholder="100% or 300px" className={inputClass} /></div>
            <div><label className={labelClass}>Link URL (optional)</label><input type="text" value={block.props.link ?? ''} onChange={e => onChange({ link: e.target.value || undefined })} placeholder="https://..." className={inputClass} /></div>
            <AlignSelect value={block.props.align} onChange={v => onChange({ align: v })} />
          </>
        )}

        {block.type === 'button' && (
          <>
            <div><label className={labelClass}>Button Text</label><input type="text" value={block.props.text} onChange={e => onChange({ text: e.target.value })} className={inputClass} /></div>
            <div><label className={labelClass}>URL</label><input type="text" value={block.props.url} onChange={e => onChange({ url: e.target.value })} placeholder="https://..." className={inputClass} /></div>
            <ColorInput value={block.props.bgColor} onChange={v => onChange({ bgColor: v })} label="Background Color" />
            <ColorInput value={block.props.textColor} onChange={v => onChange({ textColor: v })} label="Text Color" />
            <div><label className={labelClass}>Border Radius</label><input type="range" min={0} max={24} value={block.props.borderRadius} onChange={e => onChange({ borderRadius: Number(e.target.value) })} className="w-full" /><span className="text-[10px] text-text-muted">{block.props.borderRadius}px</span></div>
            <AlignSelect value={block.props.align} onChange={v => onChange({ align: v })} />
            <div className="flex items-center gap-2">
              <input type="checkbox" id="fullWidth" checked={block.props.fullWidth} onChange={e => onChange({ fullWidth: e.target.checked })} className="rounded" />
              <label htmlFor="fullWidth" className="text-xs text-text-primary">Full width</label>
            </div>
          </>
        )}

        {block.type === 'divider' && (
          <>
            <ColorInput value={block.props.color} onChange={v => onChange({ color: v })} label="Line Color" />
            <div><label className={labelClass}>Thickness</label><input type="number" value={block.props.thickness} onChange={e => onChange({ thickness: Number(e.target.value) })} min={1} max={8} className={inputClass} /></div>
            <div><label className={labelClass}>Padding</label><input type="number" value={block.props.padding} onChange={e => onChange({ padding: Number(e.target.value) })} min={0} max={48} className={inputClass} /></div>
          </>
        )}

        {block.type === 'spacer' && (
          <div>
            <label className={labelClass}>Height</label>
            <input type="range" min={4} max={80} value={block.props.height} onChange={e => onChange({ height: Number(e.target.value) })} className="w-full" />
            <span className="text-[10px] text-text-muted">{block.props.height}px</span>
          </div>
        )}

        {block.type === 'product' && (
          <>
            <div><label className={labelClass}>Product Name</label><input type="text" value={block.props.productName} onChange={e => onChange({ productName: e.target.value })} className={inputClass} /></div>
            <div><label className={labelClass}>Price</label><input type="text" value={block.props.price} onChange={e => onChange({ price: e.target.value })} className={inputClass} /></div>
            <div><label className={labelClass}>Image URL</label><input type="text" value={block.props.imageUrl} onChange={e => onChange({ imageUrl: e.target.value })} placeholder="https://..." className={inputClass} /></div>
            <div><label className={labelClass}>Description</label><input type="text" value={block.props.description ?? ''} onChange={e => onChange({ description: e.target.value })} className={inputClass} /></div>
            <div><label className={labelClass}>CTA Text</label><input type="text" value={block.props.ctaText} onChange={e => onChange({ ctaText: e.target.value })} className={inputClass} /></div>
            <div><label className={labelClass}>CTA URL</label><input type="text" value={block.props.ctaUrl} onChange={e => onChange({ ctaUrl: e.target.value })} placeholder="https://..." className={inputClass} /></div>
          </>
        )}

        {block.type === 'social' && (
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

        {block.type === 'footer' && (
          <>
            <div><label className={labelClass}>Footer Text</label><input type="text" value={block.props.text} onChange={e => onChange({ text: e.target.value })} className={inputClass} /></div>
            <div><label className={labelClass}>Unsubscribe Text</label><input type="text" value={block.props.unsubscribeText} onChange={e => onChange({ unsubscribeText: e.target.value })} className={inputClass} /></div>
          </>
        )}

        {block.type === 'columns' && (
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
            </select>
          </div>
        )}

        {/* Global Styles (always shown at bottom) */}
        <div className="pt-3 mt-3 border-t border-border">
          <div className="text-[11px] font-semibold text-text-muted mb-2">Email Styles</div>
          <div className="space-y-3">
            <ColorInput value={globalStyles.bgColor} onChange={v => onGlobalStylesChange({ bgColor: v })} label="Page Background" />
            <ColorInput value={globalStyles.contentBgColor} onChange={v => onGlobalStylesChange({ contentBgColor: v })} label="Content Background" />
          </div>
        </div>
      </div>
    </div>
  )
}
