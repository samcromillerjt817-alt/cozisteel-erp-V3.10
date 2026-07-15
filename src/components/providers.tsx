'use client'

import { SessionProvider } from 'next-auth/react'
import { ConfirmProvider } from '@/components/domain/confirm-dialog'
import { ActionResultProvider } from '@/components/domain/action-result-dialog'

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider>
      <ConfirmProvider>
        <ActionResultProvider>{children}</ActionResultProvider>
      </ConfirmProvider>
    </SessionProvider>
  )
}