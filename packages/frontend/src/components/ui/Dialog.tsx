'use client'

import { useEffect, useRef } from 'react'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils'

type DialogSize = 'sm' | 'md' | 'lg' | 'xl' | 'full'

const SIZE_CLASS: Record<DialogSize, string> = {
  sm:   'max-w-md',
  md:   'max-w-xl',
  lg:   'max-w-3xl',
  xl:   'max-w-5xl',
  full: 'max-w-[min(1200px,calc(100vw-4rem))] h-[calc(100vh-6rem)]',
}

type DialogProps = {
  open: boolean
  onClose: () => void
  /** Rendered in the header bar. Pass a node for custom headers (steppers etc.). */
  title?: React.ReactNode
  size?: DialogSize
  children: React.ReactNode
  footer?: React.ReactNode
  /** Hide the default close (X) button — e.g. when the footer owns dismissal. */
  hideClose?: boolean
  /** Block backdrop-click dismissal for flows with unsaved work. Escape still closes. */
  disableBackdropClose?: boolean
}

/**
 * Centered modal dialog — THE primitive for transactional interactions
 * (pickers, wizards, destructive confirmations). Escape closes, backdrop
 * closes (unless disabled), body scroll locks, focus moves into the panel
 * on open and Tab cycles within it.
 *
 * For side-anchored editing surfaces use `shared/SlidePanel` instead.
 */
export function Dialog({
  open, onClose, title, size = 'md', children, footer, hideClose, disableBackdropClose,
}: DialogProps) {
  const panelRef = useRef<HTMLDivElement>(null)

  // Escape to close
  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [open, onClose])

  // Body scroll lock
  useEffect(() => {
    if (!open) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [open])

  // Move focus into the panel on open; simple Tab trap within it
  useEffect(() => {
    if (!open) return
    const panel = panelRef.current
    if (!panel) return
    const previouslyFocused = document.activeElement as HTMLElement | null
    const focusables = () => Array.from(panel.querySelectorAll<HTMLElement>(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
    )).filter(el => !el.hasAttribute('disabled'))
    ;(focusables()[0] ?? panel).focus()

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return
      const els = focusables()
      if (els.length === 0) return
      const first = els[0]
      const last = els[els.length - 1]
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus() }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus() }
    }
    panel.addEventListener('keydown', onKeyDown)
    return () => {
      panel.removeEventListener('keydown', onKeyDown)
      previouslyFocused?.focus?.()
    }
  }, [open])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={disableBackdropClose ? undefined : onClose}
      />

      {/* Panel */}
      <div
        ref={panelRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        className={cn(
          'relative bg-white rounded-2xl shadow-2xl w-full flex flex-col overflow-hidden',
          'max-h-[calc(100vh-4rem)] animate-in fade-in zoom-in-95 duration-150 outline-none',
          SIZE_CLASS[size],
        )}
      >
        {(title || !hideClose) && (
          <div className="flex items-center justify-between gap-4 px-6 py-4 border-b border-border flex-shrink-0">
            <div className="min-w-0 flex-1">
              {typeof title === 'string'
                ? <h2 className="text-base font-semibold text-heading truncate">{title}</h2>
                : title}
            </div>
            {!hideClose && (
              <button
                onClick={onClose}
                aria-label="Close dialog"
                className="p-1.5 rounded-lg hover:bg-surface text-text-muted hover:text-text-primary transition-colors flex-shrink-0"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
        )}

        <div className="flex-1 overflow-y-auto min-h-0">
          {children}
        </div>

        {footer && (
          <div className="px-6 py-4 border-t border-border bg-surface/40 flex-shrink-0">
            {footer}
          </div>
        )}
      </div>
    </div>
  )
}
