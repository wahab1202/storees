'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { Loader2, CheckCircle2, XCircle } from 'lucide-react'

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001'

export default function VerifyEmailPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const token = searchParams.get('token')
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading')
  const [message, setMessage] = useState('')
  const ran = useRef(false)

  useEffect(() => {
    // Guard against React strict-mode double-invoke: the token is single-use, so a
    // second call would see it already consumed and wrongly report an error.
    if (ran.current) return
    ran.current = true

    if (!token) {
      setStatus('error')
      setMessage('This verification link is invalid or has expired.')
      return
    }

    ;(async () => {
      try {
        const res = await fetch(`${API_URL}/api/auth/verify-email`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token }),
        })
        const data = await res.json()
        if (!res.ok || !data.success) {
          setStatus('error')
          setMessage(data.error ?? 'Email verification failed')
        } else {
          setStatus('success')
          setTimeout(() => router.push('/login?verified=1'), 2500)
        }
      } catch {
        setStatus('error')
        setMessage('Something went wrong. Please try again.')
      }
    })()
  }, [token, router])

  return (
    <div className="w-full max-w-[400px]">
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-8 text-center">
        {status === 'loading' && (
          <>
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-indigo-50">
              <Loader2 className="h-6 w-6 text-indigo-600 animate-spin" />
            </div>
            <h1 className="text-xl font-semibold text-slate-900 mb-2">Verifying your email…</h1>
            <p className="text-sm text-slate-500">Activating your account and starting your trial.</p>
          </>
        )}

        {status === 'success' && (
          <>
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-green-50">
              <CheckCircle2 className="h-6 w-6 text-green-600" />
            </div>
            <h1 className="text-xl font-semibold text-slate-900 mb-2">You&apos;re all set</h1>
            <p className="text-sm text-slate-500 mb-6">
              Your email is verified and your 14-day free trial has started. Redirecting to sign in…
            </p>
            <Link href="/login?verified=1" className="text-sm text-indigo-600 hover:text-indigo-700 font-medium">
              Sign in now
            </Link>
          </>
        )}

        {status === 'error' && (
          <>
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-red-50">
              <XCircle className="h-6 w-6 text-red-600" />
            </div>
            <h1 className="text-xl font-semibold text-slate-900 mb-2">Verification failed</h1>
            <p className="text-sm text-slate-500 mb-6">{message}</p>
            <Link href="/register" className="text-sm text-indigo-600 hover:text-indigo-700 font-medium">
              Start over
            </Link>
          </>
        )}
      </div>
    </div>
  )
}
