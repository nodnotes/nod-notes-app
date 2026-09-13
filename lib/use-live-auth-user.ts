// Live auth identity for UI — never paint a stale SSR user over the active session.

'use client'

import { useEffect, useState } from 'react'
import type { User } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/client'
import { ACCOUNT_CHANGED_EVENT } from '@/lib/auth-session-isolation'

export type LiveAuthUser = {
  user: User
  /** True only when browser session user id matches the identity we will fetch boards for. */
  sessionReady: boolean
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

/** True when @supabase/ssr has written auth cookies (needed for next document SSR). */
function authCookiesPresent(): boolean {
  if (typeof document === 'undefined') return false
  // Chunked names: sb-<ref>-auth-token / .0 / .1 …
  return /(?:^|;\s*)sb-[^=;\s]+-auth-token(?:\.\d+)?=/.test(document.cookie)
}

/** One-shot session read (memory, then network). */
export async function resolveLiveSessionUser(): Promise<User | null> {
  const supabase = createClient()
  const {
    data: { session },
  } = await supabase.auth.getSession()
  if (session?.user) return session.user
  const {
    data: { user },
  } = await supabase.auth.getUser()
  return user ?? null
}

/**
 * Block until the browser session is the expected user and auth cookies exist.
 * Call this before location.assign('/board') so the first board SSR sees the session.
 */
export async function waitForAuthUserId(
  expectedUserId: string,
  opts?: { timeoutMs?: number }
): Promise<User> {
  const timeoutMs = opts?.timeoutMs ?? 8000
  const started = Date.now()
  let last: User | null = null
  while (Date.now() - started < timeoutMs) {
    last = await resolveLiveSessionUser()
    if (last?.id === expectedUserId && authCookiesPresent()) return last
    await sleep(50)
  }
  if (last?.id === expectedUserId) return last // Cookies may be HttpOnly-only — still navigate
  throw new Error('AUTH_SESSION_TIMEOUT')
}

/**
 * Source of truth for account menu / board list identity.
 * Prefer the live browser session over SSR `initialUser` (which can lag after sign-in).
 */
export function useLiveAuthUser(initialUser: User): LiveAuthUser {
  const [user, setUser] = useState(initialUser)
  const [sessionReady, setSessionReady] = useState(false)
  const supabase = createClient()

  useEffect(() => {
    let cancelled = false

    const applySession = async () => {
      setSessionReady(false)
      // Trust live session immediately — do not wait 8s for a stale SSR id then reload
      const live = await resolveLiveSessionUser()
      if (cancelled) return
      if (!live) {
        // No browser session yet — keep SSR identity visible but do not fetch (would cache [])
        setUser(initialUser)
        setSessionReady(false)
        return
      }
      setUser(live)
      setSessionReady(true)
    }

    void applySession()

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session?.user) {
        setSessionReady(false)
        return
      }
      setUser(session.user)
      setSessionReady(true)
    })

    const onAccountChanged = () => {
      setSessionReady(false)
      void applySession()
    }
    window.addEventListener(ACCOUNT_CHANGED_EVENT, onAccountChanged)

    return () => {
      cancelled = true
      subscription.unsubscribe()
      window.removeEventListener(ACCOUNT_CHANGED_EVENT, onAccountChanged)
    }
  }, [supabase.auth, initialUser.id])

  return { user, sessionReady }
}
