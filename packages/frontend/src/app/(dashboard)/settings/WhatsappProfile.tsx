'use client'

import { useEffect, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { withProject } from '@/lib/project'
import { Loader2, CheckCircle2, XCircle, ShieldCheck, Image as ImageIcon } from 'lucide-react'

type Profile = {
  about: string | null
  address: string | null
  description: string | null
  email: string | null
  websites: string[]
  vertical: string | null
  profilePictureUrl: string | null
  verifiedName: string | null
  displayNumber: string | null
}

// Meta's business verticals (whatsapp_business_profile.vertical enum).
const VERTICALS = [
  'UNDEFINED', 'OTHER', 'AUTO', 'BEAUTY', 'APPAREL', 'EDU', 'ENTERTAIN', 'EVENT_PLAN',
  'FINANCE', 'GROCERY', 'GOVT', 'HOTEL', 'HEALTH', 'NONPROFIT', 'PROF_SERVICES',
  'RETAIL', 'TRAVEL', 'RESTAURANT', 'NOT_A_BIZ',
]

/**
 * WhatsApp Business profile — the brand's public identity (photo, about,
 * website, address). Renders only when a Meta WhatsApp account is connected
 * (direct or Storees-provisioned). The display name is Meta's approved verified
 * name — shown read-only, since changes need Meta re-approval.
 */
export function WhatsappProfile() {
  const qc = useQueryClient()
  const { data, isLoading, isError } = useQuery({
    queryKey: ['whatsapp-profile'],
    queryFn: () => api.get<Profile>(withProject('/api/whatsapp/profile')),
    staleTime: 30_000,
    retry: false,
  })
  const profile = data?.success ? data.data : null

  const [about, setAbout] = useState('')
  const [description, setDescription] = useState('')
  const [email, setEmail] = useState('')
  const [address, setAddress] = useState('')
  const [websites, setWebsites] = useState('')
  const [vertical, setVertical] = useState('UNDEFINED')
  const [photoUrl, setPhotoUrl] = useState('')
  const [busy, setBusy] = useState(false)
  const [photoBusy, setPhotoBusy] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!profile) return
    setAbout(profile.about ?? ''); setDescription(profile.description ?? '')
    setEmail(profile.email ?? ''); setAddress(profile.address ?? '')
    setWebsites((profile.websites ?? []).join(', ')); setVertical(profile.vertical ?? 'UNDEFINED')
  }, [profile])

  // Not connected to Meta → nothing to manage here.
  if (isLoading) return null
  if (isError || !profile) return null

  async function save() {
    setBusy(true); setError(null); setSaved(false)
    try {
      const resp = await api.put<Profile>(withProject('/api/whatsapp/profile'), {
        about, description, email, address, vertical,
        websites: websites.split(',').map(s => s.trim()).filter(Boolean),
      })
      if (!resp.success) { setError(resp.error ?? 'Could not save the profile'); return }
      setSaved(true)
      qc.invalidateQueries({ queryKey: ['whatsapp-profile'] })
    } catch { setError('Could not save the profile') } finally { setBusy(false) }
  }

  async function setPhoto() {
    setPhotoBusy(true); setError(null)
    try {
      const resp = await api.post<Profile>(withProject('/api/whatsapp/profile/photo'), { imageUrl: photoUrl.trim() })
      if (!resp.success) { setError(resp.error ?? 'Could not set the photo'); return }
      setPhotoUrl('')
      qc.invalidateQueries({ queryKey: ['whatsapp-profile'] })
    } catch { setError('Could not set the photo') } finally { setPhotoBusy(false) }
  }

  return (
    <div className="mt-4 rounded-lg border border-border bg-white">
      <div className="px-4 py-3 border-b border-border">
        <span className="text-sm font-medium text-text-primary">WhatsApp Business Profile</span>
        <p className="text-[11px] text-text-muted mt-0.5">Your brand&apos;s public identity on WhatsApp — shown to customers you message.</p>
      </div>

      <div className="p-4 space-y-4">
        {/* Photo + approved name */}
        <div className="flex items-start gap-4">
          <div className="shrink-0">
            {profile.profilePictureUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={profile.profilePictureUrl} alt="Profile" className="w-14 h-14 rounded-full object-cover border border-border" />
            ) : (
              <div className="w-14 h-14 rounded-full bg-surface border border-border flex items-center justify-center text-text-muted">
                <ImageIcon className="h-5 w-5" />
              </div>
            )}
          </div>
          <div className="min-w-0 flex-1 space-y-1">
            <div className="flex items-center gap-1.5 text-sm">
              <ShieldCheck className="h-3.5 w-3.5 text-green-600" />
              <span className="font-medium text-text-primary">{profile.verifiedName || 'Name pending'}</span>
              {profile.displayNumber && <span className="text-text-muted">· {profile.displayNumber}</span>}
            </div>
            <p className="text-[11px] text-text-muted">The display name is Meta-approved — changing it requires a name-change review, so it&apos;s not editable here.</p>
          </div>
        </div>

        {/* Set photo from URL */}
        <div>
          <label className="block text-xs font-medium text-text-secondary mb-1.5">Profile photo (brand logo)</label>
          <div className="flex items-center gap-2">
            <input
              value={photoUrl} onChange={e => { setPhotoUrl(e.target.value); setError(null) }}
              placeholder="Public image URL (jpg/png)"
              className="flex-1 h-9 px-3 text-sm border border-border rounded-lg bg-white text-text-primary focus:outline-none focus:ring-2 focus:ring-accent/20 focus:border-accent placeholder:text-text-muted/50"
            />
            <button
              onClick={setPhoto} disabled={photoBusy || !photoUrl.trim()}
              className="px-4 h-9 text-sm font-medium rounded-lg border border-border text-text-primary hover:bg-surface disabled:opacity-50 transition-colors inline-flex items-center gap-2"
            >
              {photoBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ImageIcon className="h-3.5 w-3.5" />}
              Set photo
            </button>
          </div>
        </div>

        {/* Editable fields */}
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2">
            <label className="block text-xs font-medium text-text-secondary mb-1.5">About (short tagline)</label>
            <input value={about} onChange={e => setAbout(e.target.value)} maxLength={139}
              className="w-full h-9 px-3 text-sm border border-border rounded-lg bg-white text-text-primary focus:outline-none focus:ring-2 focus:ring-accent/20 focus:border-accent" />
          </div>
          <div className="col-span-2">
            <label className="block text-xs font-medium text-text-secondary mb-1.5">Description</label>
            <textarea value={description} onChange={e => setDescription(e.target.value)} rows={2} maxLength={512}
              className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-white text-text-primary focus:outline-none focus:ring-2 focus:ring-accent/20 focus:border-accent" />
          </div>
          <div>
            <label className="block text-xs font-medium text-text-secondary mb-1.5">Email</label>
            <input value={email} onChange={e => setEmail(e.target.value)} type="email"
              className="w-full h-9 px-3 text-sm border border-border rounded-lg bg-white text-text-primary focus:outline-none focus:ring-2 focus:ring-accent/20 focus:border-accent" />
          </div>
          <div>
            <label className="block text-xs font-medium text-text-secondary mb-1.5">Business category</label>
            <select value={vertical} onChange={e => setVertical(e.target.value)}
              className="w-full h-9 px-3 text-sm border border-border rounded-lg bg-white text-text-primary focus:outline-none focus:ring-2 focus:ring-accent/20 focus:border-accent">
              {VERTICALS.map(v => <option key={v} value={v}>{v}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-text-secondary mb-1.5">Address</label>
            <input value={address} onChange={e => setAddress(e.target.value)}
              className="w-full h-9 px-3 text-sm border border-border rounded-lg bg-white text-text-primary focus:outline-none focus:ring-2 focus:ring-accent/20 focus:border-accent" />
          </div>
          <div>
            <label className="block text-xs font-medium text-text-secondary mb-1.5">Websites (comma-separated)</label>
            <input value={websites} onChange={e => setWebsites(e.target.value)} placeholder="https://…, https://…"
              className="w-full h-9 px-3 text-sm border border-border rounded-lg bg-white text-text-primary focus:outline-none focus:ring-2 focus:ring-accent/20 focus:border-accent placeholder:text-text-muted/50" />
          </div>
        </div>

        {error && <div className="flex items-center gap-1.5 text-xs text-red-600"><XCircle className="h-3.5 w-3.5" /> {error}</div>}

        <div className="flex items-center gap-3">
          <button
            onClick={save} disabled={busy}
            className="px-5 py-2 text-sm font-medium rounded-lg bg-accent text-white hover:bg-accent/90 disabled:opacity-50 transition-colors inline-flex items-center gap-2"
          >
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
            {busy ? 'Saving…' : 'Save profile'}
          </button>
          {saved && <span className="text-xs text-green-600 inline-flex items-center gap-1"><CheckCircle2 className="h-3.5 w-3.5" /> Saved</span>}
        </div>
      </div>
    </div>
  )
}
