'use client'

import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react'
import { useQueryClient } from '@tanstack/react-query'

type ProjectContextValue = {
  projectId: string | null
  setProjectId: (id: string) => void
  projectName: string | null
}

const ProjectContext = createContext<ProjectContextValue | null>(null)

const STORAGE_KEY = 'storees-active-project'
const NAME_STORAGE_KEY = 'storees-active-project-name'

export function ProjectProvider({ children }: { children: ReactNode }) {
  const [projectId, setProjectIdState] = useState<string | null>(null)
  const [projectName, setProjectName] = useState<string | null>(null)
  const [hydrated, setHydrated] = useState(false)
  const queryClient = useQueryClient()

  // Hydrate from localStorage, then fallback to env var
  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY)
    const storedName = localStorage.getItem(NAME_STORAGE_KEY)
    if (stored) {
      setProjectIdState(stored)
      setProjectName(storedName)
    } else {
      const envId = process.env.NEXT_PUBLIC_PROJECT_ID
      if (envId) {
        setProjectIdState(envId)
      }
    }
    setHydrated(true)
  }, [])

  const setProjectId = useCallback((id: string, name?: string) => {
    setProjectIdState(id)
    localStorage.setItem(STORAGE_KEY, id)
    if (name) {
      setProjectName(name)
      localStorage.setItem(NAME_STORAGE_KEY, name)
    }
    // Invalidate all queries so data reloads for the new project
    queryClient.invalidateQueries()
  }, [queryClient])

  // Expose setter that also accepts name via a wrapper
  const contextValue: ProjectContextValue = {
    projectId,
    setProjectId: (id: string) => setProjectId(id),
    projectName,
  }

  // Don't render until hydrated to avoid flicker
  if (!hydrated) return null

  return (
    <ProjectContext.Provider value={contextValue}>
      {children}
    </ProjectContext.Provider>
  )
}

export function useProjectContext() {
  const ctx = useContext(ProjectContext)
  if (!ctx) throw new Error('useProjectContext must be used within ProjectProvider')
  return ctx
}

/** Setter that also stores the project name */
export function useSwitchProject() {
  const queryClient = useQueryClient()

  return (id: string, name?: string) => {
    localStorage.setItem(STORAGE_KEY, id)
    if (name) localStorage.setItem(NAME_STORAGE_KEY, name)
    // Force full reload to pick up new project across all hooks
    window.location.reload()
  }
}
