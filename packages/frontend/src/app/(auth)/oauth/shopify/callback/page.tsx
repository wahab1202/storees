'use client'

import { useEffect, useState } from 'react'
import { signIn } from 'next-auth/react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Loader2, CheckCircle2, AlertCircle } from 'lucide-react'

export default function ShopifyCallbackPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading')
  const [error, setError] = useState('')

  useEffect(() => {
    const token = searchParams.get('token')
    const projectId = searchParams.get('projectId')
    const errorParam = searchParams.get('error')

    if (errorParam) {
      setStatus('error')
      setError(errorParam)
      return
    }

    if (!token || !projectId) {
      setStatus('error')
      setError('Missing authentication data. Please try connecting again.')
      return
    }

    async function authenticate() {
      try {
        // Sign in via NextAuth using the JWT from the backend
        const result = await signIn('credentials', {
          email: 'shopify-oauth', // placeholder — JWT carries the real identity
          password: `__SHOPIFY_JWT__:${token}`,
          redirect: false,
        })

        if (result?.error) {
          setStatus('error')
          setError('Authentication failed. Please try again.')
          return
        }

        setStatus('success')

        // Brief pause so the user sees the success state
        setTimeout(() => {
          router.push('/dashboard')
          router.refresh()
        }, 1500)
      } catch {
        setStatus('error')
        setError('Something went wrong. Please try again.')
      }
    }

    authenticate()
  }, [searchParams, router])

  return (
    <div className="w-full max-w-[400px]">
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-8">
        <div className="text-center">
          {status === 'loading' && (
            <>
              <div className="w-12 h-12 bg-indigo-50 rounded-full flex items-center justify-center mx-auto mb-4">
                <Loader2 className="w-6 h-6 text-indigo-600 animate-spin" />
              </div>
              <h1 className="text-xl font-semibold text-slate-900">Connecting your store</h1>
              <p className="text-sm text-slate-500 mt-2">
                Setting up your account and syncing your data...
              </p>
            </>
          )}

          {status === 'success' && (
            <>
              <div className="w-12 h-12 bg-green-50 rounded-full flex items-center justify-center mx-auto mb-4">
                <CheckCircle2 className="w-6 h-6 text-green-600" />
              </div>
              <h1 className="text-xl font-semibold text-slate-900">Store connected</h1>
              <p className="text-sm text-slate-500 mt-2">
                Redirecting you to the dashboard...
              </p>
            </>
          )}

          {status === 'error' && (
            <>
              <div className="w-12 h-12 bg-red-50 rounded-full flex items-center justify-center mx-auto mb-4">
                <AlertCircle className="w-6 h-6 text-red-600" />
              </div>
              <h1 className="text-xl font-semibold text-slate-900">Connection failed</h1>
              <p className="text-sm text-red-600 mt-2">{error}</p>
              <button
                onClick={() => router.push('/projects')}
                className="mt-6 px-4 py-2.5 text-sm font-medium bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors"
              >
                Try again
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
