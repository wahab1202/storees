const STORAGE_KEY = 'storees-active-project'

/** Returns the active project ID — from localStorage first, then env var fallback */
export function getProjectId(): string {
  if (typeof window !== 'undefined') {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored) return stored
  }
  const id = process.env.NEXT_PUBLIC_PROJECT_ID
  if (!id) throw new Error('No active project. Select one from the Projects page.')
  return id
}

/** Appends projectId query param to a path */
export function withProject(path: string, params?: Record<string, string | number | undefined>): string {
  const id = getProjectId()
  const searchParams = new URLSearchParams({ projectId: id })

  if (params) {
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined) searchParams.set(key, String(value))
    }
  }

  return `${path}?${searchParams.toString()}`
}
