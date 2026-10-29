import type { ReactNode } from 'react'
import { Sidebar } from './Sidebar'
import { ErrorBoundary } from './ErrorBoundary'
import { TrialBanner } from './TrialBanner'

type AppShellProps = {
  children: ReactNode
}

export function AppShell({ children }: AppShellProps) {
  return (
    <div className="min-h-screen">
      <Sidebar />
      <main className="ml-0 lg:ml-60 pt-14 lg:pt-6 p-4 sm:p-6">
        <div className="max-w-[1280px] mx-auto">
          <TrialBanner />
          <ErrorBoundary>
            {children}
          </ErrorBoundary>
        </div>
      </main>
    </div>
  )
}
