'use client'

import { useState } from 'react'
import { useSession } from 'next-auth/react'
import { useQuery, useMutation } from '@tanstack/react-query'
import { PageHeader } from '@/components/layout/PageHeader'
import { api } from '@/lib/api'
import { Loader2, User, Key, Link2 } from 'lucide-react'
import { toast } from 'sonner'

type UserData = {
  id: string
  email: string
  name: string
  linkedProviders: string[]
  createdAt: string
}

export default function AccountSettingsPage() {
  const { data: session } = useSession()

  const { data: user, isLoading } = useQuery({
    queryKey: ['auth-me'],
    queryFn: () => api.get<UserData>('/api/auth/me'),
  })

  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')

  const changePasswordMutation = useMutation({
    mutationFn: () =>
      api.post('/api/auth/change-password', { currentPassword, newPassword }),
    onSuccess: () => {
      toast.success('Password changed successfully')
      setCurrentPassword('')
      setNewPassword('')
      setConfirmPassword('')
    },
    onError: (err: Error) => toast.error(err.message),
  })

  function handleChangePassword(e: React.FormEvent) {
    e.preventDefault()
    if (newPassword.length < 8) {
      toast.error('New password must be at least 8 characters')
      return
    }
    if (newPassword !== confirmPassword) {
      toast.error('Passwords do not match')
      return
    }
    changePasswordMutation.mutate()
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
      </div>
    )
  }

  const userData = user?.data

  return (
    <div>
      <PageHeader title="Account" description="Manage your account details and password" />

      <div className="mt-6 max-w-xl space-y-6">
        {/* Profile info */}
        <div className="bg-white rounded-xl border border-slate-200 p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 bg-indigo-50 rounded-lg flex items-center justify-center">
              <User className="w-5 h-5 text-indigo-600" />
            </div>
            <h3 className="text-sm font-semibold text-slate-900">Profile</h3>
          </div>

          <div className="space-y-3">
            <div>
              <span className="text-xs font-medium text-slate-500">Name</span>
              <p className="text-sm text-slate-900">{userData?.name}</p>
            </div>
            <div>
              <span className="text-xs font-medium text-slate-500">Email</span>
              <p className="text-sm text-slate-900">{userData?.email}</p>
            </div>
            <div>
              <span className="text-xs font-medium text-slate-500">Member since</span>
              <p className="text-sm text-slate-900">
                {userData?.createdAt ? new Date(userData.createdAt).toLocaleDateString('en-US', {
                  year: 'numeric', month: 'long', day: 'numeric',
                }) : '—'}
              </p>
            </div>
          </div>
        </div>

        {/* Change password */}
        <div className="bg-white rounded-xl border border-slate-200 p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 bg-amber-50 rounded-lg flex items-center justify-center">
              <Key className="w-5 h-5 text-amber-600" />
            </div>
            <h3 className="text-sm font-semibold text-slate-900">Change password</h3>
          </div>

          <form onSubmit={handleChangePassword} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">
                Current password
              </label>
              <input
                type="password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                required
                autoComplete="current-password"
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">
                New password
              </label>
              <input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                required
                autoComplete="new-password"
                minLength={8}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                placeholder="At least 8 characters"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">
                Confirm new password
              </label>
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                autoComplete="new-password"
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
              />
            </div>
            <button
              type="submit"
              disabled={changePasswordMutation.isPending}
              className="px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 disabled:opacity-50 flex items-center gap-2"
            >
              {changePasswordMutation.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
              Update password
            </button>
          </form>
        </div>

        {/* Connected accounts */}
        <div className="bg-white rounded-xl border border-slate-200 p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 bg-blue-50 rounded-lg flex items-center justify-center">
              <Link2 className="w-5 h-5 text-blue-600" />
            </div>
            <h3 className="text-sm font-semibold text-slate-900">Connected accounts</h3>
          </div>

          <div className="space-y-3">
            {['google', 'github'].map((provider) => {
              const connected = userData?.linkedProviders?.includes(provider)
              return (
                <div key={provider} className="flex items-center justify-between py-2">
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-medium text-slate-700 capitalize">{provider}</span>
                  </div>
                  <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${
                    connected
                      ? 'bg-green-50 text-green-700'
                      : 'bg-slate-100 text-slate-500'
                  }`}>
                    {connected ? 'Connected' : 'Not connected'}
                  </span>
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}
