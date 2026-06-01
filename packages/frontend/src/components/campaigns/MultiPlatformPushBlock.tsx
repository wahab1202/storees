'use client'

import { useState, useMemo } from 'react'
import { Smartphone, Apple, Globe, Image as ImageIcon, ExternalLink } from 'lucide-react'
import { NumberInput } from '@/components/ui/NumberInput'
import type { PushPlatform, PushPlatformContent, PushContent } from '@storees/shared'

// Gap 2: multi-platform push authoring. Mirrors MoEngage's "Target
// Platforms" step — pick Android / iOS / Web checkboxes, author content
// per platform via tabs, see a platform-shaped preview alongside.
//
// Backwards-compat: if pushPlatforms is empty, the legacy single-platform
// path (pushTitle + bodyText + pushImageUrl on the campaign row) still
// drives the send. Toggling any platform here switches over to the
// per-platform model.

const PLATFORMS: Array<{ id: PushPlatform; label: string; icon: typeof Smartphone }> = [
  { id: 'android', label: 'Android', icon: Smartphone },
  { id: 'ios', label: 'iOS', icon: Apple },
  { id: 'web', label: 'Web', icon: Globe },
]

type Props = {
  pushPlatforms: PushPlatform[]
  setPushPlatforms: (v: PushPlatform[]) => void
  pushContent: PushContent
  setPushContent: (v: PushContent) => void
  inputClass: string
}

export function MultiPlatformPushBlock({
  pushPlatforms,
  setPushPlatforms,
  pushContent,
  setPushContent,
  inputClass,
}: Props) {
  const [activeTab, setActiveTab] = useState<PushPlatform>(pushPlatforms[0] ?? 'android')

  function togglePlatform(p: PushPlatform) {
    if (pushPlatforms.includes(p)) {
      const next = pushPlatforms.filter((x) => x !== p)
      setPushPlatforms(next)
      // Drop content for the removed platform
      const { [p]: _removed, ...rest } = pushContent
      setPushContent(rest as PushContent)
      if (activeTab === p && next.length > 0) setActiveTab(next[0])
    } else {
      const next = [...pushPlatforms, p]
      setPushPlatforms(next)
      if (!pushContent[p]) {
        setPushContent({ ...pushContent, [p]: { title: '', body: '' } })
      }
      setActiveTab(p)
    }
  }

  function updateContent(platform: PushPlatform, patch: Partial<PushPlatformContent>) {
    const current = pushContent[platform] ?? { title: '', body: '' }
    setPushContent({ ...pushContent, [platform]: { ...current, ...patch } })
  }

  const activeContent: PushPlatformContent = pushContent[activeTab] ?? { title: '', body: '' }

  return (
    <div className="bg-white border border-border rounded-xl p-6 space-y-5">
      <div>
        <h3 className="text-sm font-semibold text-heading mb-1">Target platforms</h3>
        <p className="text-xs text-text-muted mb-3">
          Pick the platforms this campaign should reach. Each platform gets its own content tab — same audience, different copy per surface.
        </p>
        <div className="flex flex-wrap gap-2">
          {PLATFORMS.map((p) => {
            const Icon = p.icon
            const active = pushPlatforms.includes(p.id)
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => togglePlatform(p.id)}
                className={`inline-flex items-center gap-2 px-3.5 py-2 rounded-lg border text-sm font-medium transition-colors ${
                  active
                    ? 'border-text-primary bg-text-primary text-white'
                    : 'border-border bg-white text-text-secondary hover:border-text-muted'
                }`}
              >
                <Icon className="h-4 w-4" />
                {p.label}
                {active && <span className="text-[10px] opacity-75">✓</span>}
              </button>
            )
          })}
        </div>
      </div>

      {pushPlatforms.length > 0 && (
        <>
          {/* Per-platform tabs */}
          <div className="border-b border-border flex gap-1">
            {pushPlatforms.map((p) => {
              const Icon = PLATFORMS.find((x) => x.id === p)?.icon ?? Smartphone
              const label = PLATFORMS.find((x) => x.id === p)?.label ?? p
              return (
                <button
                  key={p}
                  type="button"
                  onClick={() => setActiveTab(p)}
                  className={`inline-flex items-center gap-1.5 px-3 py-2 -mb-px text-xs font-medium border-b-2 transition-colors ${
                    activeTab === p
                      ? 'border-text-primary text-text-primary'
                      : 'border-transparent text-text-muted hover:text-text-secondary'
                  }`}
                >
                  <Icon className="h-3.5 w-3.5" />
                  {label}
                </button>
              )
            })}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-6">
            {/* Content form */}
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-text-secondary mb-1">Title</label>
                <input
                  value={activeContent.title}
                  onChange={(e) => updateContent(activeTab, { title: e.target.value })}
                  placeholder="Notification title"
                  className={inputClass}
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-text-secondary mb-1">Body</label>
                <textarea
                  value={activeContent.body}
                  onChange={(e) => updateContent(activeTab, { body: e.target.value })}
                  rows={3}
                  placeholder="Notification body"
                  className={inputClass}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-text-secondary mb-1 flex items-center gap-1">
                    <ImageIcon className="h-3 w-3" /> Image URL
                  </label>
                  <input
                    value={activeContent.imageUrl ?? ''}
                    onChange={(e) => updateContent(activeTab, { imageUrl: e.target.value })}
                    placeholder="https://…"
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-text-secondary mb-1 flex items-center gap-1">
                    <ExternalLink className="h-3 w-3" /> Click URL
                  </label>
                  <input
                    value={activeContent.clickUrl ?? ''}
                    onChange={(e) => updateContent(activeTab, { clickUrl: e.target.value })}
                    placeholder="https://…"
                    className={inputClass}
                  />
                </div>
              </div>
              {activeTab === 'ios' && (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-text-secondary mb-1">Subtitle (iOS)</label>
                    <input
                      value={activeContent.subtitle ?? ''}
                      onChange={(e) => updateContent(activeTab, { subtitle: e.target.value })}
                      placeholder="Optional subtitle"
                      className={inputClass}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-text-secondary mb-1">Badge (iOS)</label>
                    <NumberInput
                      min={0}
                      value={activeContent.badge ?? undefined}
                      onChange={n => updateContent(activeTab, { badge: n ?? 0 })}
                      placeholder="0"
                      className={inputClass}
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Preview */}
            <div>
              <div className="text-xs font-medium text-text-muted mb-2">Preview</div>
              <PreviewFrame platform={activeTab} content={activeContent} />
            </div>
          </div>
        </>
      )}

      {pushPlatforms.length === 0 && (
        <div className="rounded-lg bg-amber-50 border border-amber-200 px-4 py-3 text-xs text-amber-900">
          Pick at least one platform above to author push content. If you skip this, the campaign falls back to the legacy single-content push using the title + body in the form below.
        </div>
      )}
    </div>
  )
}

// ── Platform-shaped previews ─────────────────────────────────────────────────

function PreviewFrame({ platform, content }: { platform: PushPlatform; content: PushPlatformContent }) {
  if (platform === 'android') return <AndroidPreview content={content} />
  if (platform === 'ios') return <IosPreview content={content} />
  return <WebPreview content={content} />
}

function AndroidPreview({ content }: { content: PushPlatformContent }) {
  return (
    <div className="rounded-xl bg-slate-900 p-3 shadow-inner">
      <div className="rounded-lg bg-white p-3">
        <div className="flex items-start gap-3">
          <div className="h-9 w-9 rounded-md bg-slate-200 flex items-center justify-center text-slate-500 shrink-0">
            <Smartphone className="h-4 w-4" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5 text-[10px] text-slate-500 mb-0.5">
              <span className="font-medium">Storees</span>
              <span>· now</span>
            </div>
            <div className="text-sm font-semibold text-slate-900 truncate">{content.title || 'Title'}</div>
            <div className="text-xs text-slate-600 line-clamp-2">{content.body || 'Body text'}</div>
            {content.imageUrl && (
              <img src={content.imageUrl} alt="" className="mt-2 rounded-md w-full h-24 object-cover" />
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function IosPreview({ content }: { content: PushPlatformContent }) {
  return (
    <div className="rounded-3xl bg-gradient-to-br from-slate-700 to-slate-900 p-3 shadow-inner">
      <div className="rounded-2xl bg-white/95 backdrop-blur p-3">
        <div className="flex items-start gap-2.5">
          <div className="h-8 w-8 rounded-md bg-slate-200 flex items-center justify-center text-slate-500 shrink-0">
            <Apple className="h-4 w-4" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between text-[10px] text-slate-500 mb-0.5">
              <span className="font-medium">STOREES</span>
              <span>now</span>
            </div>
            <div className="text-sm font-semibold text-slate-900 truncate">{content.title || 'Title'}</div>
            {content.subtitle && <div className="text-xs text-slate-700 truncate">{content.subtitle}</div>}
            <div className="text-xs text-slate-600 line-clamp-2">{content.body || 'Body text'}</div>
            {content.imageUrl && (
              <img src={content.imageUrl} alt="" className="mt-2 rounded-md w-full h-24 object-cover" />
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function WebPreview({ content }: { content: PushPlatformContent }) {
  return (
    <div className="rounded-lg border border-slate-300 bg-white shadow-lg p-3 max-w-sm">
      <div className="flex items-start gap-3">
        <div className="h-10 w-10 rounded bg-indigo-100 flex items-center justify-center text-indigo-600 shrink-0">
          <Globe className="h-5 w-5" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 text-[10px] text-slate-500 mb-0.5">
            <span className="font-medium">Storees.io</span>
            <span>· now</span>
          </div>
          <div className="text-sm font-semibold text-slate-900 truncate">{content.title || 'Title'}</div>
          <div className="text-xs text-slate-600 line-clamp-3">{content.body || 'Body text'}</div>
          {content.imageUrl && (
            <img src={content.imageUrl} alt="" className="mt-2 rounded w-full h-20 object-cover" />
          )}
          {content.clickUrl && (
            <div className="mt-2 text-[10px] text-indigo-600 truncate">{content.clickUrl}</div>
          )}
        </div>
      </div>
    </div>
  )
}
