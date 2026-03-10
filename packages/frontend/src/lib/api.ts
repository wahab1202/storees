import type { ApiResponse, PaginatedResponse } from '@storees/shared'

const BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001'

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`${BASE_URL}${path}`, {
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
    ...options,
  })

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Request failed' }))
    throw new Error((error as { error: string }).error ?? `HTTP ${response.status}`)
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
