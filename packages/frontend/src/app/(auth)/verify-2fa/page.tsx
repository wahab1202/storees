'use client'

import { useState, useRef, useEffect } from 'react'
import { signIn } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Loader2, ShieldCheck } from 'lucide-react'

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001'

export default function Verify2FAPage() {
  const router = useRouter()
  const [code, setCode] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)

    const tempToken = sessionStorage.getItem('2fa_temp_token')
    if (!tempToken) {
      setError('Session expired. Please sign in again.')
      setLoading(false)
      return
    }

    try {
      const res = await fetch(`${API_URL}/api/auth/verify-2fa`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tempToken, code }),
      })

      const data = await res.json()

      if (!res.ok || !data.success) {
        setError(data.error ?? 'Invalid code')
        setLoading(false)
        return
      }

      // Clean up temp token
      sessionStorage.removeItem('2fa_temp_token')

      // Sign in with the full JWT from 2FA verification
      // We need to store the JWT and redirect — use signIn with a custom flow
      // Since we already have the JWT, we can store it and redirect
      const result = await signIn('credentials', {
        email: data.data.user.email,
        // Use a special marker that the authorize callback can handle
        password: `__2FA_JWT__:${data.data.token}`,
        redirect: false,
      })

      if (result?.error) {
        setError('Authentication failed. Please try again.')
      } else {
        router.push('/dashboard')
        router.refresh()
      }
    } catch {
      setError('Something went wrong. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  function handleCodeChange(value: string) {
    // Only allow digits, max 6
    const digits = value.replace(/\D/g, '').slice(0, 6)
    setCode(digits)
  }

  return (
    <div className="w-full max-w-[400px]">
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-8">
        <div className="text-center mb-8">
          <div className="w-12 h-12 bg-indigo-50 rounded-full flex items-center justify-center mx-auto mb-4">
            <ShieldCheck className="w-6 h-6 text-indigo-600" />
          </div>
          <h1 className="text-2xl font-semibold text-slate-900">Two-factor authentication</h1>
          <p className="text-sm text-slate-500 mt-1">
            Enter the 6-digit code from your authenticator app
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">
              {error}
            </div>
          )}

          <div>
            <input
              ref={inputRef}
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              value={code}
              onChange={(e) => handleCodeChange(e.target.value)}
              maxLength={6}
              className="w-full px-4 py-3 border border-slate-200 rounded-lg text-center text-2xl font-mono tracking-[0.5em] focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-shadow"
              placeholder="------"
            />
          </div>

          <button
            type="submit"
            disabled={loading || code.length !== 6}
            className="w-full py-2.5 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {loading && <Loader2 className="w-4 h-4 animate-spin" />}
            Verify
          </button>
        </form>

        <p className="text-center text-sm text-slate-500 mt-6">
          <Link href="/login" className="text-indigo-600 hover:text-indigo-700 font-medium">
            Back to sign in
          </Link>
        </p>
      </div>
    </div>
  )
}
