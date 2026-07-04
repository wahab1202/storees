'use client'

import { useMemo, useState } from 'react'
import { Check, ChevronLeft, ChevronRight, Mail, MessageSquare, Bell, Phone, Search, Save, Link2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Dialog } from '@/components/ui/Dialog'
import { useTemplates, useVariableSources } from '@/hooks/useTemplates'
import { useWhatsappTemplates } from '@/hooks/useWhatsappTemplates'
import { SourcePicker, VariablePanel } from '@/components/templates/VariablePanel'
import { WhatsAppBubblePreview } from '@/components/whatsapp/WhatsAppBubblePreview'
import type {
  ActionNode, EmailTemplate, WhatsappTemplate, TemplateVariable,
  TemplateVariableFormat, TemplateVariableSource, CampaignUtmParameters,
} from '@storees/shared'

type ActionType = ActionNode['config']['actionType']
type ActionConfig = ActionNode['config']

const CHANNELS: Array<{ value: ActionType; label: string; icon: typeof Mail }> = [
  { value: 'send_email',    label: 'Email',    icon: Mail },
  { value: 'send_sms',      label: 'SMS',      icon: MessageSquare },
  { value: 'send_push',     label: 'Push',     icon: Bell },
  { value: 'send_whatsapp', label: 'WhatsApp', icon: Phone },
]

const CHANNEL_OF: Record<ActionType, 'email' | 'sms' | 'push' | 'whatsapp'> = {
  send_email: 'email', send_sms: 'sms', send_push: 'push', send_whatsapp: 'whatsapp',
}

const STEPS = ['Template', 'Variables', 'Settings'] as const

const INPUT = 'w-full h-8 px-2 text-xs border border-border rounded-md bg-white focus:outline-none focus:ring-1 focus:ring-accent/30'

/** Short human token for a source binding, shown in the live preview. */
function sourceToken(v: TemplateVariable): string {
  if (v.defaultValue) return v.defaultValue
  const s = v.source
  switch (s.kind) {
    case 'customer':  return `‹customer.${s.field}›`
    case 'attribute': return `‹attr.${s.key}›`
    case 'product':   return `‹product.${s.field}›`
    case 'project':   return `‹project.${s.field}›`
    case 'event':     return `‹event.${s.key}›`
    case 'literal':   return s.value || '‹literal›'
  }
}

/** Seed positional rows 1..N from node override → template defaults → heuristic. */
function seedWaVariables(count: number, nodeVars: TemplateVariable[] | undefined, tplVars: TemplateVariable[] | null | undefined): TemplateVariable[] {
  const byKey = new Map<string, TemplateVariable>()
  for (const v of tplVars ?? []) byKey.set(v.key, v)
  for (const v of nodeVars ?? []) byKey.set(v.key, v) // node overrides win
  return Array.from({ length: count }, (_, i) => {
    const key = String(i + 1)
    return byKey.get(key) ?? { key, source: { kind: 'customer', field: 'name' } as TemplateVariableSource }
  })
}

function defaultUtm(channel: string, templateName?: string): CampaignUtmParameters {
  return {
    enabled: false,
    params: [
      { key: 'utm_source', value: 'storees' },
      { key: 'utm_medium', value: channel },
      { key: 'utm_campaign', value: templateName ?? 'flow' },
    ],
  }
}

type Props = {
  open: boolean
  initial: ActionConfig
  onSave: (config: ActionConfig) => void
  onClose: () => void
}

/**
 * Stepped configuration wizard for flow send nodes:
 *   ① Template — searchable list + live message preview (no more blind dropdowns)
 *   ② Variables — per-node source mapping (overrides the template's defaults)
 *   ③ Settings — UTM tagging for link attribution
 */
export function SendNodeConfigModal({ open, initial, onSave, onClose }: Props) {
  const [step, setStep] = useState(0)
  const [actionType, setActionType] = useState<ActionType>(initial.actionType)
  const [templateId, setTemplateId] = useState(initial.templateId)
  const [templateName, setTemplateName] = useState(initial.templateName ?? '')
  const [variables, setVariables] = useState<TemplateVariable[]>(initial.variables ?? [])
  const [utm, setUtm] = useState<CampaignUtmParameters>(
    initial.utmParameters ?? defaultUtm(CHANNEL_OF[initial.actionType], initial.templateName),
  )
  const [search, setSearch] = useState('')

  const channel = CHANNEL_OF[actionType]
  const isWhatsapp = channel === 'whatsapp'

  const { data: templatesData, isLoading: generalLoading } = useTemplates()
  const { data: waData, isLoading: waLoading } = useWhatsappTemplates()
  const { data: catalogResp } = useVariableSources()
  const catalog = catalogResp?.data ?? null

  // WhatsApp must send synced APPROVED provider templates (see ActionBlock note:
  // anything else falls to a free-form send → Meta #131047).
  const waTemplates = useMemo(() => (waData?.data ?? [])
    .filter(t => String(t.status).toUpperCase() === 'APPROVED'), [waData])
  const generalTemplates = useMemo(() => (templatesData?.data ?? [])
    .filter(t => t.channel === channel), [templatesData, channel])

  const q = search.trim().toLowerCase()
  const waFiltered = useMemo(() => q ? waTemplates.filter(t => t.name.toLowerCase().includes(q)) : waTemplates, [waTemplates, q])
  const generalFiltered = useMemo(() => q ? generalTemplates.filter(t => t.name.toLowerCase().includes(q)) : generalTemplates, [generalTemplates, q])

  const selectedWa: WhatsappTemplate | undefined = isWhatsapp ? waTemplates.find(t => t.id === templateId) : undefined
  const selectedGeneral: EmailTemplate | undefined = !isWhatsapp ? generalTemplates.find(t => t.id === templateId) : undefined
  const isLoading = isWhatsapp ? waLoading : generalLoading

  function pickChannel(next: ActionType) {
    if (next === actionType) return
    setActionType(next)
    setTemplateId('')
    setTemplateName('')
    setVariables([])
    setUtm(u => ({ ...u, params: u.params.map(p => p.key === 'utm_medium' ? { ...p, value: CHANNEL_OF[next] } : p) }))
  }

  function pickTemplate(id: string, name: string) {
    setTemplateId(id)
    setTemplateName(name)
    // Re-seed variables for the newly chosen template (node override no longer applies)
    if (isWhatsapp) {
      const tpl = waTemplates.find(t => t.id === id)
      setVariables(seedWaVariables(tpl?.parameterCount ?? 0, undefined, tpl?.variables))
    } else {
      const tpl = generalTemplates.find(t => t.id === id)
      setVariables(tpl?.variables ?? [])
    }
    setUtm(u => ({ ...u, params: u.params.map(p => p.key === 'utm_campaign' && (p.value === 'flow' || !p.value) ? { ...p, value: name } : p) }))
  }

  function handleSave() {
    onSave({
      ...initial,
      actionType,
      templateId,
      templateName,
      variables: variables.length > 0 ? variables : undefined,
      utmParameters: utm,
    })
  }

  const waSamples = isWhatsapp && selectedWa
    ? seedWaVariables(selectedWa.parameterCount ?? 0, variables, selectedWa.variables).map(sourceToken)
    : undefined

  const stepper = (
    <div className="flex items-center gap-1">
      {STEPS.map((label, i) => {
        const enabled = i === 0 || !!templateId
        return (
          <button
            key={label}
            type="button"
            disabled={!enabled}
            onClick={() => enabled && setStep(i)}
            className={cn(
              'flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors',
              i === step ? 'bg-accent/10 text-accent' : enabled ? 'text-text-secondary hover:bg-surface' : 'text-text-muted/50 cursor-not-allowed',
            )}
          >
            <span className={cn(
              'w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold',
              i < step ? 'bg-accent text-white' : i === step ? 'border-2 border-accent text-accent' : 'border border-border text-text-muted',
            )}>
              {i < step ? <Check className="h-3 w-3" /> : i + 1}
            </span>
            {label}
          </button>
        )
      })}
    </div>
  )

  const footer = (
    <div className="flex items-center justify-between">
      <button type="button" onClick={onClose} className="px-4 py-2 text-xs font-medium text-text-secondary rounded-lg hover:bg-surface transition-colors">
        Cancel
      </button>
      <div className="flex items-center gap-2">
        {step > 0 && (
          <button type="button" onClick={() => setStep(step - 1)} className="inline-flex items-center gap-1 px-4 py-2 text-xs font-medium border border-border rounded-lg hover:bg-surface transition-colors">
            <ChevronLeft className="h-3.5 w-3.5" /> Back
          </button>
        )}
        {step < STEPS.length - 1 ? (
          <button
            type="button"
            disabled={!templateId}
            onClick={() => setStep(step + 1)}
            className="inline-flex items-center gap-1 px-5 py-2 text-xs font-semibold rounded-lg bg-accent text-white hover:bg-accent-hover transition-colors disabled:opacity-50"
          >
            Next <ChevronRight className="h-3.5 w-3.5" />
          </button>
        ) : (
          <button
            type="button"
            disabled={!templateId}
            onClick={handleSave}
            className="inline-flex items-center gap-1.5 px-5 py-2 text-xs font-semibold rounded-lg bg-accent text-white hover:bg-accent-hover transition-colors disabled:opacity-50"
          >
            <Save className="h-3.5 w-3.5" /> Save
          </button>
        )}
      </div>
    </div>
  )

  return (
    <Dialog open={open} onClose={onClose} size="xl" title={stepper} footer={footer}>
      {step === 0 && (
        <div className="flex h-[480px]">
          {/* Left: channel + search + list */}
          <div className="w-[55%] border-r border-border flex flex-col min-w-0">
            <div className="p-4 space-y-3 border-b border-border">
              <div className="flex gap-1.5">
                {CHANNELS.map(c => {
                  const Icon = c.icon
                  return (
                    <button
                      key={c.value}
                      type="button"
                      onClick={() => pickChannel(c.value)}
                      className={cn(
                        'flex-1 inline-flex items-center justify-center gap-1.5 py-2 text-xs font-medium rounded-lg border transition-colors',
                        actionType === c.value ? 'border-accent bg-accent/5 text-accent' : 'border-border text-text-secondary hover:bg-surface',
                      )}
                    >
                      <Icon className="h-3.5 w-3.5" /> {c.label}
                    </button>
                  )
                })}
              </div>
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-text-muted" />
                <input
                  type="text"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder="Search templates…"
                  className={cn(INPUT, 'pl-8 h-9')}
                />
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-2">
              {isLoading && <p className="p-4 text-xs text-text-muted">Loading templates…</p>}
              {!isLoading && (isWhatsapp ? waFiltered : generalFiltered).length === 0 && (
                <div className="p-6 text-center">
                  <p className="text-xs text-text-muted">
                    {q ? 'No templates match your search.' : `No ${channel} templates yet.`}
                  </p>
                  {!q && (
                    <a href={isWhatsapp ? '/templates/whatsapp/new' : '/templates/create'} className="mt-2 inline-block text-xs font-medium text-accent underline">
                      Create one under Templates → New
                    </a>
                  )}
                </div>
              )}
              {isWhatsapp
                ? waFiltered.map(t => (
                    <TemplateRow
                      key={t.id}
                      selected={templateId === t.id}
                      onPick={() => pickTemplate(t.id, t.name)}
                      name={t.name}
                      meta={[t.language, t.category ?? undefined, t.parameterCount ? `${t.parameterCount} var${t.parameterCount > 1 ? 's' : ''}` : undefined]}
                      body={t.bodyText}
                    />
                  ))
                : generalFiltered.map(t => (
                    <TemplateRow
                      key={t.id}
                      selected={templateId === t.id}
                      onPick={() => pickTemplate(t.id, t.name)}
                      name={t.name}
                      meta={[t.subject ?? undefined]}
                      body={t.bodyText ?? undefined}
                    />
                  ))}
            </div>
          </div>

          {/* Right: live preview of the highlighted template */}
          <div className="w-[45%] flex flex-col min-w-0 bg-surface/40">
            <div className="px-4 py-2.5 border-b border-border">
              <span className="text-[11px] font-semibold text-text-muted uppercase tracking-wide">Preview</span>
              {templateName && <span className="ml-2 text-xs font-medium text-text-primary">{templateName}</span>}
            </div>
            <div className="flex-1 overflow-y-auto">
              <MessagePreview channel={channel} wa={selectedWa} general={selectedGeneral} samples={waSamples} />
            </div>
          </div>
        </div>
      )}

      {step === 1 && (
        <div className="flex min-h-[480px]">
          {/* Left: variable mapping */}
          <div className="w-[55%] border-r border-border p-4 space-y-3 min-w-0">
            <div>
              <h3 className="text-sm font-semibold text-text-primary">Variables</h3>
              <p className="mt-0.5 text-[11px] text-text-muted leading-relaxed">
                Bind each template variable for <em>this flow step</em>. These override the template&apos;s default mapping — the same template can bind differently in another flow.
              </p>
            </div>
            {isWhatsapp ? (
              (selectedWa?.parameterCount ?? 0) === 0 ? (
                <p className="py-6 text-center text-xs text-text-muted">This template has no variables — nothing to map.</p>
              ) : (
                seedWaVariables(selectedWa?.parameterCount ?? 0, variables, selectedWa?.variables).map((v, i) => (
                  <div key={v.key} className="rounded-lg border border-border p-3 space-y-2">
                    <code className="inline-block rounded bg-surface px-1.5 py-0.5 font-mono text-xs">{`{{${v.key}}}`}</code>
                    <SourcePicker
                      catalog={catalog}
                      source={v.source}
                      onChange={src => {
                        const next = seedWaVariables(selectedWa?.parameterCount ?? 0, variables, selectedWa?.variables)
                        next[i] = { ...next[i], source: src }
                        setVariables(next)
                      }}
                    />
                    <div className="grid grid-cols-2 gap-2">
                      <input
                        type="text"
                        value={v.defaultValue ?? ''}
                        onChange={e => {
                          const next = seedWaVariables(selectedWa?.parameterCount ?? 0, variables, selectedWa?.variables)
                          next[i] = { ...next[i], defaultValue: e.target.value || undefined }
                          setVariables(next)
                        }}
                        placeholder="Fallback value"
                        className={INPUT}
                      />
                      <select
                        value={v.format ?? ''}
                        onChange={e => {
                          const next = seedWaVariables(selectedWa?.parameterCount ?? 0, variables, selectedWa?.variables)
                          next[i] = { ...next[i], format: (e.target.value || undefined) as TemplateVariableFormat | undefined }
                          setVariables(next)
                        }}
                        className={INPUT}
                      >
                        <option value="">No format</option>
                        <option value="money">Money (₹1,234.56)</option>
                        <option value="date">Date (YYYY-MM-DD)</option>
                        <option value="date:long">Date (Jan 1, 2026)</option>
                        <option value="date:short">Date (Jan 1)</option>
                        <option value="upper">UPPERCASE</option>
                        <option value="lower">lowercase</option>
                        <option value="title">Title Case</option>
                      </select>
                    </div>
                  </div>
                ))
              )
            ) : (
              <VariablePanel
                variables={variables}
                onChange={setVariables}
                contentSources={[selectedGeneral?.subject, selectedGeneral?.htmlBody ?? selectedGeneral?.bodyText]}
                preview={{
                  subject: selectedGeneral?.subject,
                  htmlBody: selectedGeneral?.htmlBody,
                  bodyText: selectedGeneral?.bodyText,
                }}
              />
            )}
          </div>
          {/* Right: live preview with bindings substituted */}
          <div className="w-[45%] flex flex-col min-w-0 bg-surface/40">
            <div className="px-4 py-2.5 border-b border-border">
              <span className="text-[11px] font-semibold text-text-muted uppercase tracking-wide">Preview with bindings</span>
            </div>
            <div className="flex-1 overflow-y-auto">
              <MessagePreview channel={channel} wa={selectedWa} general={selectedGeneral} samples={waSamples} />
            </div>
          </div>
        </div>
      )}

      {step === 2 && (
        <div className="p-6 max-w-2xl space-y-5">
          <div className="rounded-xl border border-border overflow-hidden">
            <div className="flex items-center justify-between px-5 py-3.5 bg-surface border-b border-border">
              <div className="flex items-center gap-2">
                <Link2 className="h-4 w-4 text-accent" />
                <div>
                  <h3 className="text-sm font-semibold text-text-primary">Add UTM parameters</h3>
                  <p className="text-[11px] text-text-muted">Tag outgoing links so this step shows up in GA / attribution reports.</p>
                </div>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={utm.enabled}
                onClick={() => setUtm({ ...utm, enabled: !utm.enabled })}
                className={cn('relative w-9 h-5 rounded-full transition-colors', utm.enabled ? 'bg-accent' : 'bg-gray-300')}
              >
                <span className={cn('absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform', utm.enabled && 'translate-x-[16px]')} />
              </button>
            </div>

            {utm.enabled && (
              <div className="p-5 space-y-3">
                {utm.params.map((p, i) => (
                  <div key={i} className="grid grid-cols-[1fr_1.5fr_auto] gap-2 items-center">
                    <input
                      type="text"
                      value={p.key}
                      onChange={e => setUtm({ ...utm, params: utm.params.map((x, j) => j === i ? { ...x, key: e.target.value } : x) })}
                      placeholder="utm_key"
                      className={INPUT}
                    />
                    <input
                      type="text"
                      value={p.value}
                      onChange={e => setUtm({ ...utm, params: utm.params.map((x, j) => j === i ? { ...x, value: e.target.value } : x) })}
                      placeholder="value — {{variables}} allowed"
                      className={INPUT}
                    />
                    <button
                      type="button"
                      onClick={() => setUtm({ ...utm, params: utm.params.filter((_, j) => j !== i) })}
                      className="text-xs text-text-muted hover:text-red-500 px-1"
                      aria-label="Remove parameter"
                    >
                      ✕
                    </button>
                  </div>
                ))}
                <button
                  type="button"
                  onClick={() => setUtm({ ...utm, params: [...utm.params, { key: '', value: '' }] })}
                  className="text-xs font-medium text-accent hover:underline"
                >
                  + Add custom parameter
                </button>

                <div className="rounded-lg bg-surface border border-border p-3">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-text-muted mb-1">Preview</p>
                  <code className="text-[11px] text-text-secondary break-all">
                    {'{your_link}'}?{utm.params.filter(p => p.key && p.value).map(p => `${p.key}=${encodeURIComponent(p.value)}`).join('&') || '…'}
                  </code>
                </div>

                <p className="text-[11px] text-text-muted leading-relaxed">
                  {channel === 'email' && 'Applied to every link in the email body at send time.'}
                  {channel === 'whatsapp' && 'Applied to the destinations of URL buttons that have "Track clicks" enabled on the template. Untracked buttons keep their original URL (it is baked into the approved template).'}
                  {(channel === 'sms' || channel === 'push') && 'UTM tagging for this channel lands with flow link-tracking (coming next) — the configuration is saved now.'}
                </p>
              </div>
            )}
          </div>
        </div>
      )}
    </Dialog>
  )
}

function TemplateRow({ selected, onPick, name, meta, body }: {
  selected: boolean; onPick: () => void; name: string
  meta: (string | undefined)[]; body?: string
}) {
  return (
    <button
      type="button"
      onClick={onPick}
      className={cn(
        'w-full text-left rounded-lg border p-3 mb-1.5 transition-colors',
        selected ? 'border-accent bg-accent/5 ring-1 ring-accent/20' : 'border-transparent hover:bg-surface',
      )}
    >
      <div className="flex items-center gap-2">
        <span className={cn(
          'w-3.5 h-3.5 rounded-full border flex items-center justify-center flex-shrink-0',
          selected ? 'border-accent bg-accent' : 'border-gray-300',
        )}>
          {selected && <Check className="h-2.5 w-2.5 text-white" />}
        </span>
        <span className="text-xs font-medium text-text-primary truncate">{name}</span>
      </div>
      <div className="mt-1 ml-[22px]">
        {meta.filter(Boolean).length > 0 && (
          <p className="text-[10px] text-text-muted">{meta.filter(Boolean).join(' · ')}</p>
        )}
        {body && <p className="mt-0.5 text-[11px] text-text-secondary line-clamp-2">{body}</p>}
      </div>
    </button>
  )
}

function MessagePreview({ channel, wa, general, samples }: {
  channel: 'email' | 'sms' | 'push' | 'whatsapp'
  wa?: WhatsappTemplate
  general?: EmailTemplate
  samples?: (string | undefined)[]
}) {
  if (channel === 'whatsapp') {
    if (!wa) return <EmptyPreview />
    return (
      <WhatsAppBubblePreview
        bodyText={wa.bodyText}
        header={wa.header}
        footer={wa.footer}
        buttons={wa.buttons}
        carousel={wa.carousel}
        samples={samples}
        className="min-h-full"
      />
    )
  }
  if (!general) return <EmptyPreview />
  if (channel === 'email') {
    return (
      <div className="p-4 space-y-2">
        {general.subject && (
          <div className="rounded-md border border-border bg-white px-3 py-2">
            <p className="text-[10px] uppercase tracking-wide text-text-muted">Subject</p>
            <p className="text-xs font-medium text-text-primary">{general.subject}</p>
          </div>
        )}
        {general.htmlBody ? (
          <div className="rounded-md border border-border bg-white overflow-hidden">
            <iframe srcDoc={general.htmlBody} title={general.name} className="w-full h-96 bg-white" sandbox="allow-same-origin" />
          </div>
        ) : (
          <p className="text-xs text-text-muted p-2">No HTML body.</p>
        )}
      </div>
    )
  }
  // SMS / push — plain text bubble
  return (
    <div className="p-4">
      <div className="max-w-[280px] rounded-2xl rounded-bl-sm bg-white border border-border px-3.5 py-2.5 shadow-sm">
        {channel === 'push' && general.subject && (
          <p className="text-xs font-semibold text-text-primary mb-0.5">{general.subject}</p>
        )}
        <p className="whitespace-pre-wrap text-xs text-text-secondary leading-relaxed">
          {general.bodyText || 'No message body.'}
        </p>
      </div>
    </div>
  )
}

function EmptyPreview() {
  return (
    <div className="flex items-center justify-center h-full min-h-[200px]">
      <p className="text-xs text-text-muted">Select a template to preview it here.</p>
    </div>
  )
}
