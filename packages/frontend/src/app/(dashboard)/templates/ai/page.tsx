'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { PageHeader } from '@/components/layout/PageHeader'
import { useAiEmailLayout, type EmailLayoutResult } from '@/hooks/useAiEmailLayout'
import { useCreateTemplate } from '@/hooks/useTemplates'
import { useBrandKit } from '@/hooks/useBrandKit'
import { aiBlocksToBuilderTemplate } from '@/lib/aiEmailToBuilder'
import { ArrowLeft, Sparkles, Loader2, Save, Wand2, PencilRuler } from 'lucide-react'
import { toast } from 'sonner'
import { AI_TEMPLATE_STASH } from './constants'

const TONES = ['persuasive', 'friendly', 'urgent', 'informative', 'playful', 'premium']
const inputClass = 'w-full px-3 py-2 text-sm border border-border rounded-lg bg-white text-text-primary focus:outline-none focus:ring-2 focus:ring-accent/20 focus:border-accent placeholder:text-text-muted'

export default function AiEmailDesignerPage() {
  const router = useRouter()
  const generate = useAiEmailLayout()
  const createTemplate = useCreateTemplate()
  const { data: brand } = useBrandKit()

  const [goal, setGoal] = useState('')
  const [tone, setTone] = useState('persuasive')
  const [hasCart, setHasCart] = useState(true)
  const [hasRecommendations, setHasRecommendations] = useState(true)
  const [result, setResult] = useState<EmailLayoutResult | null>(null)
  const [name, setName] = useState('')

  async function handleGenerate() {
    if (!goal.trim()) return toast.error('Describe what the email should do')
    try {
      const res = await generate.mutateAsync({ goal: goal.trim(), tone, hasCart, hasRecommendations })
      setResult(res.data)
      if (!name) setName(goal.trim().slice(0, 50))
    } catch (err) {
      toast.error((err as Error).message || 'Generation failed')
    }
  }

  async function handleSave() {
    if (!result) return
    if (!name.trim()) return toast.error('Give the template a name')
    try {
      await createTemplate.mutateAsync({ name: name.trim(), channel: 'email', subject: result.subject, htmlBody: result.html })
      toast.success('Template saved')
      router.push('/templates')
    } catch (err) {
      toast.error((err as Error).message || 'Failed to save template')
    }
  }

  function handleEditInBuilder() {
    if (!result) return
    const template = aiBlocksToBuilderTemplate(result.blocks, {
      subject: result.subject,
      accent: brand?.data?.effective?.accentColor,
    })
    try {
      sessionStorage.setItem(AI_TEMPLATE_STASH, JSON.stringify({ name: name.trim(), subject: result.subject, template }))
      router.push('/templates/create?from=ai')
    } catch {
      toast.error('Could not open the editor — try saving directly instead')
    }
  }

  return (
    <div>
      <Link href="/templates" className="inline-flex items-center gap-1.5 text-sm text-text-muted hover:text-text-primary mb-3">
        <ArrowLeft className="h-4 w-4" /> Templates
      </Link>
      <PageHeader
        title="AI Email Designer"
        description="Describe the email you want. The AI designs the layout, sections and copy; your brand kit and live product data fill in automatically."
      />

      <div className="grid grid-cols-1 lg:grid-cols-[380px_1fr] gap-6">
        {/* Prompt */}
        <div className="space-y-4">
          <section className="border border-border rounded-xl p-5 bg-surface space-y-4">
            <label className="block">
              <span className="block text-xs font-medium text-text-secondary mb-1">What should this email do?</span>
              <textarea
                value={goal}
                onChange={e => setGoal(e.target.value)}
                rows={4}
                placeholder="e.g. Win back shoppers who abandoned their cart, with a 10% off nudge"
                className={inputClass + ' resize-none'}
              />
            </label>
            <label className="block">
              <span className="block text-xs font-medium text-text-secondary mb-1">Tone</span>
              <select value={tone} onChange={e => setTone(e.target.value)} className={inputClass}>
                {TONES.map(t => <option key={t} value={t}>{t[0].toUpperCase() + t.slice(1)}</option>)}
              </select>
            </label>
            <div className="space-y-2">
              <Toggle label="Include the shopper's cart items" checked={hasCart} onChange={setHasCart} />
              <Toggle label="Include a recommendation grid" checked={hasRecommendations} onChange={setHasRecommendations} />
            </div>
            <button
              onClick={handleGenerate}
              disabled={generate.isPending}
              className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-semibold bg-accent text-white rounded-lg hover:bg-accent-hover transition-colors disabled:opacity-50"
            >
              {generate.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />}
              {generate.isPending ? 'Designing…' : result ? 'Regenerate' : 'Design email'}
            </button>
          </section>

          {result && (
            <section className="border border-border rounded-xl p-5 bg-surface space-y-3">
              <label className="block">
                <span className="block text-xs font-medium text-text-secondary mb-1">Subject</span>
                <input value={result.subject} readOnly className={inputClass + ' text-text-muted'} />
              </label>
              <label className="block">
                <span className="block text-xs font-medium text-text-secondary mb-1">Template name</span>
                <input value={name} onChange={e => setName(e.target.value)} placeholder="Abandoned cart — AI" className={inputClass} />
              </label>
              <div className="flex flex-col gap-2">
                <button
                  onClick={handleSave}
                  disabled={createTemplate.isPending}
                  className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-semibold bg-accent text-white rounded-lg hover:bg-accent-hover transition-colors disabled:opacity-50"
                >
                  {createTemplate.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                  Save as template
                </button>
                <button
                  onClick={handleEditInBuilder}
                  className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-semibold border border-border text-text-secondary rounded-lg hover:bg-background transition-colors"
                >
                  <PencilRuler className="h-4 w-4" />
                  Edit in builder
                </button>
              </div>
            </section>
          )}
        </div>

        {/* Preview */}
        <div className="border border-border rounded-xl overflow-hidden bg-background min-h-[560px]">
          {result ? (
            <iframe
              title="Email preview"
              sandbox=""
              srcDoc={result.previewHtml}
              className="w-full h-[720px] border-0 bg-white"
            />
          ) : (
            <div className="flex flex-col items-center justify-center h-[560px] text-center px-6">
              <Sparkles className="h-8 w-8 text-text-muted mb-3" />
              <p className="text-sm font-medium text-text-primary">Your designed email appears here</p>
              <p className="text-sm text-text-muted mt-1 max-w-sm">Describe the goal on the left and hit “Design email”. The preview fills with your brand and sample products.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      role="switch"
      aria-checked={checked}
      className="flex items-center justify-between w-full gap-3 text-left"
    >
      <span className="text-sm text-text-primary">{label}</span>
      <span className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors ${checked ? 'bg-accent' : 'bg-slate-300'}`}>
        <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${checked ? 'translate-x-4' : 'translate-x-0.5'}`} />
      </span>
    </button>
  )
}
