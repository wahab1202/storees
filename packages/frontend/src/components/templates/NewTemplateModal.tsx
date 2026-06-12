'use client'

import { useRouter } from 'next/navigation'
import { Mail, MessageSquare, Bell, Phone, Layers, X } from 'lucide-react'
import type { TemplateChannel } from '@storees/shared'

type ChannelChoice = {
  value: TemplateChannel
  label: string
  description: string
  icon: typeof Mail
  /** where selecting this channel takes you */
  href: string
}

const CHOICES: ChannelChoice[] = [
  { value: 'email',    label: 'Email',    description: 'HTML email with subject line',          icon: Mail,          href: '/templates/create?channel=email' },
  { value: 'sms',      label: 'SMS',      description: 'Plain text, up to 160 chars',           icon: MessageSquare, href: '/templates/create?channel=sms' },
  { value: 'push',     label: 'Push',     description: 'Title + body notification',             icon: Bell,          href: '/templates/create?channel=push' },
  { value: 'whatsapp', label: 'WhatsApp', description: 'Meta-approved template with variables',  icon: Phone,         href: '/templates/whatsapp/new' },
  { value: 'in_app',   label: 'In-App',   description: 'Modal, banner, toast, or inbox card',    icon: Layers,        href: '/templates/create?channel=in_app' },
]

export function NewTemplateModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const router = useRouter()
  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        className="w-full max-w-2xl overflow-hidden rounded-xl border border-border bg-white shadow-xl"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <div>
            <h2 className="text-base font-semibold text-text-primary">New template</h2>
            <p className="text-xs text-text-muted">Choose a channel to start with.</p>
          </div>
          <button onClick={onClose} className="rounded p-1 text-text-muted hover:bg-surface" aria-label="Close">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="grid grid-cols-1 gap-3 p-5 sm:grid-cols-2">
          {CHOICES.map(ch => {
            const Icon = ch.icon
            return (
              <button
                key={ch.value}
                type="button"
                onClick={() => router.push(ch.href)}
                className="flex items-start gap-3 rounded-lg border border-border p-4 text-left transition-colors hover:border-accent hover:bg-accent/5"
              >
                <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-surface">
                  <Icon className="h-5 w-5 text-accent" />
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-text-primary">{ch.label}</p>
                  <p className="mt-0.5 text-xs leading-5 text-text-muted">{ch.description}</p>
                </div>
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}
