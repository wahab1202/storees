import type { Metadata } from 'next'
import { Toaster } from 'sonner'
import { Providers } from './providers'
import { AppShell } from '@/components/layout/AppShell'
import './globals.css'

export const metadata: Metadata = {
  title: 'Storees — Marketing Automation',
  description: 'Shopify marketing automation platform',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body>
        <Providers>
          <AppShell>
            {children}
          </AppShell>
          <Toaster position="bottom-right" richColors />
        </Providers>
      </body>
    </html>
  )
}
