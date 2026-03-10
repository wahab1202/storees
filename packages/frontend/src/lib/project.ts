/** Returns the active project ID from env. Will be replaced with proper project switching later. */
export function getProjectId(): string {
  const id = process.env.NEXT_PUBLIC_PROJECT_ID
  if (!id) throw new Error('NEXT_PUBLIC_PROJECT_ID is not set')
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
