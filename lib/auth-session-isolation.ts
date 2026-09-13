// Account-switch isolation — drop previous user's client cache/prefs (Notion-style).
// Server RLS already scopes rows; this stops UI from serving another account's boards.

'use client'

import type { QueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { clearAllFrameDomSnapshots } from '@/lib/frame-dom-snapshot'

/** Fired after identity-bound client state is wiped (same tab, new user or sign-out). */
export const ACCOUNT_CHANGED_EVENT = 'nodnotes-account-changed'

/** Same cookie name as sidebar-context (avoid importing that module here). */
const CHAT_SIDEBAR_COOKIE = 'nodnotes-chat-sidebar-open'

/** Exact keys that hold account-private data (not device chrome like theme). */
const IDENTITY_EXACT_KEYS = [
  'nodnotes-ai-agent-drafts',
  'nodnotes-ai-logo-drawing',
  'nodnotes-ai-topper',
  'nodnotes-ai-topbar-pinned',
  'nodnotes-ai-model-id',
  'nodnotes-show-ai-origin',
  'nodnotes-notion-topbar-pinned',
  'nodnotes-notion-active-workspace-id',
  'nodnotes-notion-import-picker-expanded',
  'nodnotes-notion-hidden-rows',
  'nodnotes-chat-thread-id',
  'nodnotes-chat-sidebar-open',
  'nodnotes-chat-sidebar-width',
  'nodnotes-pinned-ai-threads',
  'nodnotes-board-captures',
  'nodnotes-board-presentations',
  'nodnotes-boards-nav-pinned',
] as const

/** Prefixes for per-board caches that can leak layout/content across accounts. */
const IDENTITY_PREFIXES = [
  'nodnotes-canvas-positions-',
  'nodnotes-frame-dom-',
  'nodnotes-prefs-',
  'nodnotes-failed-canvas-saves-',
] as const

function isInAppPath(pathname: string): boolean {
  return (
    pathname.startsWith('/board') ||
    pathname.startsWith('/project') ||
    pathname.startsWith('/study-set') ||
    pathname.startsWith('/embed')
  )
}

/** Remove identity-bound localStorage (+ chat open cookie). Device theme/view prefs stay. */
export function clearIdentityLocalState(): void {
  if (typeof window === 'undefined') return
  try {
    for (const key of IDENTITY_EXACT_KEYS) {
      localStorage.removeItem(key)
    }
    const toRemove: string[] = []
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)
      if (!key) continue
      if (IDENTITY_PREFIXES.some((p) => key.startsWith(p))) toRemove.push(key)
    }
    for (const key of toRemove) localStorage.removeItem(key)
  } catch {
    // Private mode / quota — ignore
  }
  try {
    document.cookie = `${CHAT_SIDEBAR_COOKIE}=; Path=/; Max-Age=0; SameSite=Lax`
  } catch {
    // Ignore
  }
}

/** Wipe React Query + identity local/memory state for the previous account. */
export function clearAccountClientState(queryClient: QueryClient): void {
  queryClient.clear()
  queryClient.removeQueries({ queryKey: ['conversations'] })
  queryClient.removeQueries({ queryKey: ['projects'] })
  queryClient.removeQueries({ queryKey: ['user-profile'] })
  queryClient.removeQueries({ queryKey: ['messages-for-panels'] })
  queryClient.removeQueries({ queryKey: ['panel-edges'] })
  queryClient.removeQueries({ queryKey: ['canvas-nodes'] })
  clearIdentityLocalState()
  clearAllFrameDomSnapshots()
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(ACCOUNT_CHANGED_EVENT))
  }
}

/**
 * Subscribe once: when auth.uid changes, wipe client state.
 * Hard-reload only when switching accounts *inside* the app (already on /board).
 * Sign-in pages own navigation after waitForAuthUserId — do not race them here.
 */
export function subscribeAccountIsolation(queryClient: QueryClient): () => void {
  const supabase = createClient()
  let lastUserId: string | null | undefined

  const { data } = supabase.auth.onAuthStateChange((_event, session) => {
    const nextId = session?.user?.id ?? null
    if (lastUserId === undefined) {
      lastUserId = nextId // INITIAL_SESSION
      return
    }
    if (nextId === lastUserId) return // TOKEN_REFRESHED
    const prevId = lastUserId
    lastUserId = nextId
    clearAccountClientState(queryClient)

    if (typeof window === 'undefined') return

    // Signed out → leave the app
    if (!nextId) {
      if (isInAppPath(window.location.pathname)) window.location.replace('/')
      return
    }

    // Switched from user A → user B while already in the app → full reload (after cookies exist)
    if (prevId && nextId && prevId !== nextId && isInAppPath(window.location.pathname)) {
      void (async () => {
        const { waitForAuthUserId } = await import('@/lib/use-live-auth-user')
        try {
          await waitForAuthUserId(nextId, { timeoutMs: 8000 })
        } catch {
          /* still reload — better than showing A’s boards */
        }
        window.location.reload()
      })()
    }
    // Sign-in from / or /access: leave navigation to the sign-in handler (after waitForAuthUserId)
  })

  return () => data.subscription.unsubscribe()
}
