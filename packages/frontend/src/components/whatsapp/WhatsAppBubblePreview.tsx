'use client'

import { ExternalLink, Phone, Copy, MessageSquareReply, Image as ImageIcon, Video, FileText } from 'lucide-react'
import type { WhatsappButton, WhatsappHeader, WhatsappCarouselCard } from '@storees/shared'

type Props = {
  bodyText: string
  header?: WhatsappHeader | null
  footer?: string | null
  buttons?: WhatsappButton[] | null
  carousel?: WhatsappCarouselCard[] | null
  /** Positional sample values for {{1}}..{{N}} — unresolved tokens stay visible. */
  samples?: (string | undefined)[]
  className?: string
}

function substitute(text: string, samples?: (string | undefined)[]): string {
  if (!samples || samples.length === 0) return text
  return text.replace(/\{\{\s*(\d+)\s*\}\}/g, (_, n) => samples[Number(n) - 1]?.trim() || `{{${n}}}`)
}

/**
 * WhatsApp-chat-styled message preview rendered from a whatsapp_templates row.
 * Presentational only — no builder state. Used by the flow send-node template
 * picker; the template builder keeps its own live-state preview.
 */
export function WhatsAppBubblePreview({ bodyText, header, footer, buttons, carousel, samples, className }: Props) {
  const body = substitute(bodyText || 'Message preview', samples)
  const headerType = header?.type ?? header?.format
  const headerText = headerType === 'TEXT' ? substitute(header?.text ?? '', samples) : ''
  const btns = buttons ?? []
  const cards = carousel ?? []

  return (
    <div
      className={className}
      style={{ background: '#E5DDD5', backgroundImage: 'radial-gradient(rgba(0,0,0,0.04) 1px, transparent 0)', backgroundSize: '16px 16px' }}
    >
      <div className="p-4">
        <div className="ml-auto max-w-[280px] rounded-lg rounded-tr-sm bg-white p-2.5 shadow-sm">
          {(headerType === 'IMAGE' || headerType === 'VIDEO' || headerType === 'DOCUMENT') && (
            header?.example && headerType === 'IMAGE' ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={header.example} alt="" className="mb-2 h-28 w-full rounded-md object-cover bg-slate-100" />
            ) : (
              <div className="mb-2 flex h-28 items-center justify-center rounded-md bg-slate-100 text-slate-400">
                {headerType === 'IMAGE' ? <ImageIcon className="h-7 w-7" /> : headerType === 'VIDEO' ? <Video className="h-7 w-7" /> : <FileText className="h-7 w-7" />}
              </div>
            )
          )}
          {headerText && <p className="mb-1 text-[13px] font-semibold text-slate-900">{headerText}</p>}
          <p className="whitespace-pre-wrap text-[13px] leading-snug text-slate-800">{body}</p>
          {footer && <p className="mt-1.5 text-[11px] text-slate-400">{footer}</p>}
          <p className="mt-1 text-right text-[10px] text-slate-400">11:30</p>
        </div>

        {btns.length > 0 && (
          <div className="ml-auto mt-1.5 max-w-[280px] space-y-1.5">
            {btns.map((b, i) => (
              <div key={i} className="flex items-center justify-center gap-1.5 rounded-lg bg-white py-2 text-[13px] font-medium text-[#00A5F4] shadow-sm">
                {b.type === 'URL' ? <ExternalLink className="h-3.5 w-3.5" /> : b.type === 'PHONE_NUMBER' ? <Phone className="h-3.5 w-3.5" /> : (b.type === 'COPY_CODE' || b.type === 'OTP') ? <Copy className="h-3.5 w-3.5" /> : <MessageSquareReply className="h-3.5 w-3.5" />}
                {b.text || 'Button'}
              </div>
            ))}
          </div>
        )}

        {cards.length > 0 && (
          <div className="mt-2 flex gap-2 overflow-x-auto pb-1">
            {cards.map((card, i) => (
              <div key={i} className="w-[150px] shrink-0 overflow-hidden rounded-lg bg-white shadow-sm">
                <div className="flex h-20 items-center justify-center bg-slate-100 text-slate-400">
                  {card.headerType === 'VIDEO' ? <Video className="h-6 w-6" /> : <ImageIcon className="h-6 w-6" />}
                </div>
                <p className="line-clamp-3 px-2 py-1.5 text-[11px] leading-snug text-slate-800">{substitute(card.bodyText || 'Card text', samples)}</p>
                {(card.buttons ?? []).map((b, j) => (
                  <div key={j} className="border-t border-slate-100 py-1.5 text-center text-[11px] font-medium text-[#00A5F4]">{b.text || 'Button'}</div>
                ))}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
