'use client'

import { cn } from '@/lib/utils'
import { Check, Eye, MousePointerClick } from 'lucide-react'

type TemplatePreviewCardProps = {
  name: string
  htmlBody?: string | null
  subject?: string | null
  selected?: boolean
  onChoose?: () => void
  onPreview?: () => void
  channelIcon?: React.ReactNode
}

export function TemplatePreviewCard({
  name,
  htmlBody,
  subject,
  selected,
  onChoose,
  onPreview,
  channelIcon,
}: TemplatePreviewCardProps) {
  return (
    <div
      className={cn(
        'relative group rounded-xl border-2 overflow-hidden transition-all cursor-pointer h-64',
        selected ? 'border-accent ring-1 ring-accent/20' : 'border-border hover:border-gray-300',
      )}
      onClick={onChoose}
    >
      {/* Preview area */}
      <div className="h-[70%] bg-gray-50 relative overflow-hidden">
        {htmlBody ? (
          <iframe
            srcDoc={htmlBody}
            title={name}
            className="w-[400%] h-[400%] origin-top-left scale-[0.25] pointer-events-none border-0"
            sandbox="allow-same-origin"
            loading="lazy"
          />
        ) : (
          <div className="flex items-center justify-center h-full">
            {channelIcon ?? (
              <div className="w-10 h-10 rounded-lg bg-gray-100 flex items-center justify-center">
                <span className="text-lg text-text-muted">+</span>
              </div>
            )}
          </div>
        )}

        {/* Hover overlay */}
        <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
          {onChoose && (
            <button
              onClick={(e) => { e.stopPropagation(); onChoose() }}
              className="px-3 py-1.5 bg-accent text-white text-xs font-medium rounded-lg flex items-center gap-1 hover:bg-accent-hover transition-colors"
            >
              <MousePointerClick className="h-3 w-3" />
              Choose
            </button>
          )}
          {onPreview && (
            <button
              onClick={(e) => { e.stopPropagation(); onPreview() }}
              className="px-3 py-1.5 bg-white text-text-primary text-xs font-medium rounded-lg flex items-center gap-1 hover:bg-gray-50 transition-colors"
            >
              <Eye className="h-3 w-3" />
              Preview
            </button>
          )}
        </div>
      </div>

      {/* Info area */}
      <div className="h-[30%] px-3 py-2 flex flex-col justify-center">
        <h4 className="text-xs font-medium text-text-primary line-clamp-1">{name}</h4>
        {subject && (
          <p className="text-[10px] text-text-muted mt-0.5 line-clamp-1">{subject}</p>
        )}
      </div>

      {/* Selected indicator */}
      {selected && (
        <div className="absolute top-2 right-2 w-5 h-5 rounded-full bg-accent flex items-center justify-center shadow-sm">
          <Check className="h-3 w-3 text-white" />
        </div>
      )}
    </div>
  )
}
