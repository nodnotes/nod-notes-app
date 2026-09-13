// Mount sidebar from live session when SSR cookies lag after sign-in (no hard reload).

'use client'

import { useEffect, useState } from 'react'
import type { User } from '@supabase/supabase-js'
import AppSidebar from '@/components/app-sidebar'
import { resolveLiveSessionUser } from '@/lib/use-live-auth-user'

type AppAuthShellProps = {
  ssrUser: User | null // Layout cookie read — may be null on the first /board hit after OTP
}

/**
 * Always try to show the account chrome for the browser session.
 * Hard-nav after sign-in can race cookie persistence; SSR then omits AppSidebar and
 * nothing recovered until a manual reload. Prefer the live session over a second reload.
 */
export default function AppAuthShell({ ssrUser }: AppAuthShellProps) {
  const [user, setUser] = useState<User | null>(ssrUser)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      const live = await resolveLiveSessionUser()
      if (cancelled || !live) return
      // Live wins — SSR may still be null or a prior account until the next full document load
      setUser(live)
    })()
    return () => {
      cancelled = true
    }
  }, [ssrUser?.id])

  if (!user) return null
  return <AppSidebar user={user} />
}
