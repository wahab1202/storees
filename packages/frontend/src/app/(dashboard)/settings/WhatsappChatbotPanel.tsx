'use client'

import { useEffect, useState } from 'react'
import { useWhatsappChatbotConfig, useSaveWhatsappChatbotConfig, type ChatbotFaq } from '@/hooks/useWhatsappChatbot'
import { Bot, Loader2, Plus, Trash2, Save } from 'lucide-react'
import { toast } from 'sonner'

const inputClass = 'w-full px-3 py-2 text-sm border border-border rounded-lg bg-white text-text-primary focus:outline-none focus:ring-2 focus:ring-accent/20 focus:border-accent placeholder:text-text-muted'

export function WhatsappChatbotPanel() {
  const { data, isLoading } = useWhatsappChatbotConfig()
  const save = useSaveWhatsappChatbotConfig()

  const [enabled, setEnabled] = useState(false)
  const [greeting, setGreeting] = useState('')
  const [keywords, setKeywords] = useState('')
  const [faqs, setFaqs] = useState<ChatbotFaq[]>([])
  const [answerUnknown, setAnswerUnknown] = useState(false)

  useEffect(() => {
    const c = data?.data
    if (!c) return
    setEnabled(c.enabled)
    setGreeting(c.greeting ?? '')
    setKeywords((c.handoffKeywords ?? []).join(', '))
    setFaqs(c.faqs ?? [])
    setAnswerUnknown(c.answerUnknown ?? false)
  }, [data])

  function updateFaq(i: number, field: 'q' | 'a', value: string) {
    setFaqs(prev => prev.map((f, idx) => (idx === i ? { ...f, [field]: value } : f)))
  }

  async function handleSave() {
    const cleanFaqs = faqs.map(f => ({ q: f.q.trim(), a: f.a.trim() })).filter(f => f.q && f.a)
    try {
      await save.mutateAsync({
        enabled,
        greeting: greeting.trim() || undefined,
        handoffKeywords: keywords.split(',').map(k => k.trim()).filter(Boolean),
        faqs: cleanFaqs,
        maxTurns: data?.data?.maxTurns ?? 8,
        answerUnknown,
      })
      toast.success('Chatbot settings saved')
    } catch (err) {
      toast.error((err as Error).message || 'Failed to save')
    }
  }

  return (
    <section className="rounded-xl border border-border bg-white">
      <div className="flex items-center justify-between border-b border-border px-5 py-4">
        <div className="flex items-center gap-2.5">
          <span className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-accent/10 text-accent"><Bot className="h-5 w-5" /></span>
          <div>
            <h2 className="text-sm font-semibold text-text-primary">AI Chatbot</h2>
            <p className="text-xs text-text-muted">Auto-reply to inbound WhatsApp: FAQs, order status, product picks — with human handoff.</p>
          </div>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={enabled}
          onClick={() => setEnabled(v => !v)}
          className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors ${enabled ? 'bg-accent' : 'bg-slate-300'}`}
        >
          <span className={`inline-block h-5 w-5 transform rounded-full bg-white transition-transform ${enabled ? 'translate-x-5' : 'translate-x-0.5'}`} />
        </button>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-10 text-text-muted"><Loader2 className="h-4 w-4 animate-spin mr-2" />Loading…</div>
      ) : (
        <div className="space-y-5 p-5">
          <label className="block">
            <span className="block text-xs font-medium text-text-secondary mb-1">Greeting (optional)</span>
            <input value={greeting} onChange={e => setGreeting(e.target.value)} placeholder="Hi! How can we help?" className={inputClass} />
          </label>

          <label className="block">
            <span className="block text-xs font-medium text-text-secondary mb-1">Handoff keywords</span>
            <input value={keywords} onChange={e => setKeywords(e.target.value)} placeholder="refund, complaint, cancel" className={inputClass} />
            <p className="mt-1 text-xs text-text-muted">Comma-separated. A message containing any of these (or asking for a human/agent) is routed to a person instead of the bot.</p>
          </label>

          <div className="flex items-start justify-between gap-4 p-3 border border-border rounded-lg bg-background/40">
            <div>
              <p className="text-sm font-medium text-text-primary">Answer unknown numbers</p>
              <p className="text-xs text-text-muted">Reply to people not yet in your customer list (FAQ-only — no order or recommendation data). Captures cold inbound leads.</p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={answerUnknown}
              onClick={() => setAnswerUnknown(v => !v)}
              className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors ${answerUnknown ? 'bg-accent' : 'bg-slate-300'}`}
            >
              <span className={`inline-block h-5 w-5 transform rounded-full bg-white transition-transform ${answerUnknown ? 'translate-x-5' : 'translate-x-0.5'}`} />
            </button>
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-medium text-text-secondary">Knowledge base (FAQs)</span>
              <button
                type="button"
                onClick={() => setFaqs(prev => [...prev, { q: '', a: '' }])}
                className="inline-flex items-center gap-1 text-xs font-medium text-accent hover:underline"
              >
                <Plus className="h-3.5 w-3.5" /> Add FAQ
              </button>
            </div>
            {faqs.length === 0 ? (
              <p className="text-xs text-text-muted border border-dashed border-border rounded-lg px-3 py-4 text-center">
                No FAQs yet. The bot answers only from these + order data, and hands off anything it can't ground.
              </p>
            ) : (
              <div className="space-y-2">
                {faqs.map((f, i) => (
                  <div key={i} className="flex gap-2 items-start">
                    <div className="flex-1 space-y-1.5 min-w-0">
                      <input value={f.q} onChange={e => updateFaq(i, 'q', e.target.value)} placeholder="Question" className={inputClass} />
                      <input value={f.a} onChange={e => updateFaq(i, 'a', e.target.value)} placeholder="Answer" className={inputClass} />
                    </div>
                    <button
                      type="button"
                      onClick={() => setFaqs(prev => prev.filter((_, idx) => idx !== i))}
                      className="mt-1 p-1.5 text-text-muted hover:text-red-600 hover:bg-red-50 rounded"
                      aria-label="Remove FAQ"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="flex items-center gap-3 pt-1">
            <button
              onClick={handleSave}
              disabled={save.isPending}
              className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium bg-accent text-white rounded-lg hover:bg-accent-hover transition-colors disabled:opacity-50"
            >
              {save.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Save chatbot settings
            </button>
            <p className="text-xs text-text-muted">Replies send as session messages (within WhatsApp's 24h window) and need a provider that supports free-form text.</p>
          </div>
        </div>
      )}
    </section>
  )
}
