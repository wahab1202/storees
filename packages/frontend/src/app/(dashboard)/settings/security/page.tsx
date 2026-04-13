'use client'

import { useState } from 'react'
import { useSession } from 'next-auth/react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { PageHeader } from '@/components/layout/PageHeader'
import { api } from '@/lib/api'
import { Loader2, ShieldCheck, ShieldOff, QrCode, Copy, Check } from 'lucide-react'
import { toast } from 'sonner'

type UserData = {
  totpEnabled: boolean
}

type SetupData = {
  qrCode: string
  secret: string
}

export default function SecuritySettingsPage() {
  const { data: session } = useSession()
  const queryClient = useQueryClient()
  const [setupData, setSetupData] = useState<SetupData | null>(null)
  const [verifyCode, setVerifyCode] = useState('')
  const [disableCode, setDisableCode] = useState('')
  const [showDisable, setShowDisable] = useState(false)
  const [copied, setCopied] = useState(false)

  const { data: user, isLoading } = useQuery({
    queryKey: ['auth-me'],
    queryFn: () => api.get<UserData>('/api/auth/me'),
  })

  const setupMutation = useMutation({
    mutationFn: () => api.post<SetupData>('/api/auth/setup-2fa', {}),
    onSuccess: (data) => {
      setSetupData(data.data)
    },
    onError: (err: Error) => toast.error(err.message),
  })

  const enableMutation = useMutation({
    mutationFn: (code: string) => api.post('/api/auth/enable-2fa', { code }),
    onSuccess: () => {
      toast.success('Two-factor authentication enabled')
      setSetupData(null)
      setVerifyCode('')
      queryClient.invalidateQueries({ queryKey: ['auth-me'] })
    },
    onError: (err: Error) => toast.error(err.message),
  })

  const disableMutation = useMutation({
    mutationFn: (code: string) => api.post('/api/auth/disable-2fa', { code }),
    onSuccess: () => {
      toast.success('Two-factor authentication disabled')
      setShowDisable(false)
      setDisableCode('')
      queryClient.invalidateQueries({ queryKey: ['auth-me'] })
    },
    onError: (err: Error) => toast.error(err.message),
  })

  const totpEnabled = user?.data?.totpEnabled ?? false

  function copySecret() {
    if (setupData?.secret) {
      navigator.clipboard.writeText(setupData.secret)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
      </div>
    )
  }

  return (
    <div>
      <PageHeader title="Security" description="Manage two-factor authentication and security settings" />

      <div className="mt-6 max-w-xl">
        <div className="bg-white rounded-xl border border-slate-200 p-6">
          <div className="flex items-start justify-between">
            <div className="flex items-start gap-3">
              {totpEnabled ? (
                <div className="w-10 h-10 bg-green-50 rounded-lg flex items-center justify-center">
                  <ShieldCheck className="w-5 h-5 text-green-600" />
                </div>
              ) : (
                <div className="w-10 h-10 bg-slate-50 rounded-lg flex items-center justify-center">
                  <ShieldOff className="w-5 h-5 text-slate-400" />
                </div>
              )}
              <div>
                <h3 className="text-sm font-semibold text-slate-900">Two-factor authentication</h3>
                <p className="text-sm text-slate-500 mt-0.5">
                  {totpEnabled
                    ? 'Your account is protected with an authenticator app'
                    : 'Add an extra layer of security to your account'}
                </p>
              </div>
            </div>

            {!setupData && (
              <button
                onClick={() => {
                  if (totpEnabled) {
                    setShowDisable(!showDisable)
                  } else {
                    setupMutation.mutate()
                  }
                }}
                disabled={setupMutation.isPending}
                className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
                  totpEnabled
                    ? 'border border-red-200 text-red-600 hover:bg-red-50'
                    : 'bg-indigo-600 text-white hover:bg-indigo-700'
                }`}
              >
                {setupMutation.isPending ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : totpEnabled ? (
                  'Disable'
                ) : (
                  'Enable'
                )}
              </button>
            )}
          </div>

          {/* Disable 2FA confirmation */}
          {showDisable && (
            <div className="mt-4 pt-4 border-t border-slate-100">
              <p className="text-sm text-slate-600 mb-3">
                Enter your authenticator code to disable 2FA:
              </p>
              <div className="flex gap-3">
                <input
                  type="text"
                  inputMode="numeric"
                  value={disableCode}
                  onChange={(e) => setDisableCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  maxLength={6}
                  placeholder="000000"
                  className="w-32 px-3 py-2 border border-slate-200 rounded-lg text-sm text-center font-mono tracking-widest focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
                <button
                  onClick={() => disableMutation.mutate(disableCode)}
                  disabled={disableCode.length !== 6 || disableMutation.isPending}
                  className="px-4 py-2 bg-red-600 text-white text-sm font-medium rounded-lg hover:bg-red-700 disabled:opacity-50 flex items-center gap-2"
                >
                  {disableMutation.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
                  Confirm disable
                </button>
              </div>
            </div>
          )}

          {/* Setup 2FA flow */}
          {setupData && (
            <div className="mt-6 pt-6 border-t border-slate-100 space-y-6">
              <div>
                <h4 className="text-sm font-medium text-slate-900 mb-3 flex items-center gap-2">
                  <QrCode className="w-4 h-4" />
                  Step 1: Scan QR code
                </h4>
                <p className="text-sm text-slate-500 mb-4">
                  Scan this QR code with your authenticator app (Google Authenticator, Authy, etc.)
                </p>
                <div className="flex justify-center p-4 bg-white border border-slate-200 rounded-lg w-fit mx-auto">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={setupData.qrCode} alt="2FA QR Code" className="w-48 h-48" />
                </div>
              </div>

              <div>
                <p className="text-sm text-slate-500 mb-2">
                  Or enter this secret manually:
                </p>
                <div className="flex items-center gap-2">
                  <code className="flex-1 px-3 py-2 bg-slate-50 rounded-lg text-xs font-mono text-slate-700 break-all">
                    {setupData.secret}
                  </code>
                  <button
                    onClick={copySecret}
                    className="p-2 text-slate-400 hover:text-slate-600 transition-colors"
                  >
                    {copied ? <Check className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <div>
                <h4 className="text-sm font-medium text-slate-900 mb-3">
                  Step 2: Enter verification code
                </h4>
                <div className="flex gap-3">
                  <input
                    type="text"
                    inputMode="numeric"
                    value={verifyCode}
                    onChange={(e) => setVerifyCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    maxLength={6}
                    placeholder="000000"
                    className="w-32 px-3 py-2 border border-slate-200 rounded-lg text-sm text-center font-mono tracking-widest focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                  <button
                    onClick={() => enableMutation.mutate(verifyCode)}
                    disabled={verifyCode.length !== 6 || enableMutation.isPending}
                    className="px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 disabled:opacity-50 flex items-center gap-2"
                  >
                    {enableMutation.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
                    Verify & enable
                  </button>
                  <button
                    onClick={() => { setSetupData(null); setVerifyCode('') }}
                    className="px-4 py-2 border border-slate-200 text-sm text-slate-600 rounded-lg hover:bg-slate-50"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
