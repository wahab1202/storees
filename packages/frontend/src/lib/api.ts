import type { ApiResponse, PaginatedResponse } from '@storees/shared'
import { getSession } from 'next-auth/react'

const BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001'

export class ApiError extends Error {
  status: number
  payload: unknown

  constructor(message: string, status: number, payload: unknown) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.payload = payload
  }
}

async function getAuthHeaders(): Promise<Record<string, string>> {
  try {
    const session = await getSession()
    const jwt = (session as Record<string, unknown> | null)?.backendJwt as string | undefined
    if (jwt) {
      return { Authorization: `Bearer ${jwt}` }
    }
  } catch {
    // Server-side or no session — proceed without auth
  }
  return {}
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const authHeaders = await getAuthHeaders()
  // For FormData bodies, let the browser set the multipart Content-Type (boundary).
  const isFormData = typeof FormData !== 'undefined' && options?.body instanceof FormData

  const response = await fetch(`${BASE_URL}${path}`, {
    headers: {
      ...(isFormData ? {} : { 'Content-Type': 'application/json' }),
      ...authHeaders,
      ...options?.headers,
    },
    ...options,
  })

  if (!response.ok) {
    // Auto sign-out on expired/invalid JWT
    if (response.status === 401 && typeof window !== 'undefined') {
      const { signOut } = await import('next-auth/react')
      await signOut({ callbackUrl: '/login' })
      throw new Error('Session expired')
    }
    const error = await response.json().catch(() => ({ error: 'Request failed' }))
    throw new ApiError((error as { error: string }).error ?? `HTTP ${response.status}`, response.status, error)
  }

  return response.json() as Promise<T>
}

export const api = {
  get: <T>(path: string) => request<ApiResponse<T>>(path),
  getPaginated: <T>(path: string) => request<PaginatedResponse<T>>(path),
  post: <T>(path: string, body: unknown) =>
    request<ApiResponse<T>>(path, {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  upload: <T>(path: string, formData: FormData) =>
    request<ApiResponse<T>>(path, {
      method: 'POST',
      body: formData,
    }),
  put: <T>(path: string, body: unknown) =>
    request<ApiResponse<T>>(path, {
      method: 'PUT',
      body: JSON.stringify(body),
    }),
  patch: <T>(path: string, body: unknown) =>
    request<ApiResponse<T>>(path, {
      method: 'PATCH',
      body: JSON.stringify(body),
    }),
  delete: <T>(path: string) =>
    request<ApiResponse<T>>(path, { method: 'DELETE' }),
}
