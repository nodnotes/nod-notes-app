'use client'

// Board-level Yjs + Hocuspocus session: one Y.Doc per board, awareness for presence

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import * as Y from 'yjs'
import { HocuspocusProvider } from '@hocuspocus/provider'
import { createClient } from '@/lib/supabase/client'
import { resolveAvatarColor } from '@/lib/avatar-colors'
import {
  boardCollabRoomName,
  getHocuspocusUrl,
  isCollabConfigured,
} from '@/lib/collab/config'
import {
  getFrameFragment,
  getFramesLayoutMap,
  getMetaMap,
  getThreadsMap,
  isFragmentEmpty,
  readAllFrameLayouts,
  setFrameLayouts,
  tryClaimSeed,
  type CollabAwarenessUser,
  type CollabFrameLayout,
  type CollabThread,
} from '@/lib/collab/board-doc'
import { scheduleLayoutSnapshot } from '@/lib/collab/snapshot'
import { useBoardAccess } from '@/lib/share/board-access-context'

export type BoardCollabPeer = CollabAwarenessUser & { clientId: number }

type BoardCollabValue = {
  /** True when NEXT_PUBLIC_HOCUSPOCUS_URL is set and we are not in a sandbox. */
  configured: boolean
  /** Provider connected + initial sync finished. */
  synced: boolean
  /** Shared Y.Doc for this board (stable for the session). */
  doc: Y.Doc | null
  /** Hocuspocus provider (null when disabled / disconnected). */
  provider: HocuspocusProvider | null
  /** Local awareness identity (for TipTap carets). */
  localUser: CollabAwarenessUser | null
  /** Remote peers currently on the board (excludes self). */
  peers: BoardCollabPeer[]
  /** Can mutate Y.Doc (edit|owner). */
  canWrite: boolean
  /** XmlFragment for a frame — only use after synced. */
  getFragment: (messageId: string) => Y.XmlFragment | null
  /** True when fragment is empty (seed TipTap from HTML once). */
  fragmentNeedsSeed: (messageId: string) => boolean
  /** Publish local frame layouts into Y (and debounce DB). */
  publishLayouts: (layouts: Record<string, CollabFrameLayout>) => void
  /** Read current Y layout map. */
  readLayouts: () => Record<string, CollabFrameLayout>
  /** Subscribe to remote layout changes (returns unsubscribe). */
  subscribeLayouts: (cb: (layouts: Record<string, CollabFrameLayout>) => void) => () => void
  /** Publish pointer in flow coordinates (throttled by caller). */
  setCursor: (flow: { x: number; y: number } | null) => void
  /** Publish selected frame message ids. */
  setSelectedFrames: (ids: string[]) => void
  /** Claim first-seed responsibility after sync. */
  claimSeed: () => boolean
  /** Whether meta.seeded is already true. */
  isSeeded: () => boolean
}

const BoardCollabContext = createContext<BoardCollabValue | null>(null)

const ORIGIN_LOCAL = 'local' // Y transaction origin for our own writes

function displayNameFromUser(email: string | null | undefined, meta: Record<string, unknown>): string {
  const fromMeta = typeof meta.display_name === 'string' ? meta.display_name.trim() : ''
  if (fromMeta) return fromMeta
  if (email) return email.split('@')[0] || email
  return 'Someone'
}

export function BoardCollabProvider({
  boardId,
  enabled = true,
  children,
}: {
  boardId: string | undefined
  /** False for embeds / sandboxes / missing id. */
  enabled?: boolean
  children: ReactNode
}) {
  const { canEdit, role } = useBoardAccess()
  const configured = isCollabConfigured() && enabled && !!boardId

  const docRef = useRef<Y.Doc | null>(null)
  if (!docRef.current && configured) {
    docRef.current = new Y.Doc()
  }

  const [provider, setProvider] = useState<HocuspocusProvider | null>(null)
  const [synced, setSynced] = useState(false)
  const [peers, setPeers] = useState<BoardCollabPeer[]>([])
  const [localUser, setLocalUser] = useState<CollabAwarenessUser | null>(null)
  const localUserRef = useRef<CollabAwarenessUser | null>(null)

  // Connect / disconnect when board or config changes
  useEffect(() => {
    if (!configured || !boardId) {
      setProvider(null)
      setSynced(false)
      setPeers([])
      return
    }

    const doc = docRef.current ?? new Y.Doc()
    docRef.current = doc
    const url = getHocuspocusUrl()
    const supabase = createClient()
    let cancelled = false
    let hp: HocuspocusProvider | null = null

    const boot = async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession()
      if (cancelled || !session?.access_token) return

      const { data: profile } = await supabase
        .from('profiles')
        .select('metadata')
        .eq('id', session.user.id)
        .maybeSingle()
      const meta = (profile?.metadata as Record<string, unknown>) || {}
      const color = resolveAvatarColor(
        typeof meta.avatar_color === 'string' ? meta.avatar_color : null
      )
      const me: CollabAwarenessUser = {
        id: session.user.id,
        name: displayNameFromUser(session.user.email, meta),
        color,
        avatarEmoji: typeof meta.avatar_emoji === 'string' ? meta.avatar_emoji : null,
        avatarUnified: typeof meta.avatar_unified === 'string' ? meta.avatar_unified : null,
        cursor: null,
        selectedFrameIds: [],
      }
      if (cancelled) return
      localUserRef.current = me
      setLocalUser(me)

      hp = new HocuspocusProvider({
        url,
        name: boardCollabRoomName(boardId),
        document: doc,
        token: session.access_token,
        onAuthenticationFailed: () => {
          console.warn('[collab] auth failed for', boardId)
        },
        onSynced: () => {
          if (!cancelled) setSynced(true)
        },
        onAwarenessUpdate: ({ states }) => {
          if (cancelled) return
          const next: BoardCollabPeer[] = []
          for (const s of states) {
            const u = (s as { clientId: number; user?: CollabAwarenessUser }).user
            const clientId = (s as { clientId: number }).clientId
            if (!u?.id || u.id === me.id) continue // Skip self
            next.push({ ...u, clientId })
          }
          setPeers(next)
        },
      })

      // Publish local awareness user payload
      hp.setAwarenessField('user', me)
      if (!cancelled) setProvider(hp)
    }

    void boot()

    return () => {
      cancelled = true
      setSynced(false)
      hp?.destroy()
      setProvider(null)
      setPeers([])
    }
  }, [configured, boardId])

  // Refresh JWT on the provider when the session refreshes
  useEffect(() => {
    if (!provider) return
    const supabase = createClient()
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.access_token) {
        // Provider picks up new token on reconnect; force token field
        ;(provider as unknown as { configuration: { token: string } }).configuration.token =
          session.access_token
      }
    })
    return () => sub.subscription.unsubscribe()
  }, [provider])

  const getFragment = useCallback(
    (messageId: string) => {
      const doc = docRef.current
      if (!doc || !synced) return null
      return getFrameFragment(doc, messageId)
    },
    [synced]
  )

  const fragmentNeedsSeed = useCallback(
    (messageId: string) => {
      const frag = getFragment(messageId)
      return !!frag && isFragmentEmpty(frag)
    },
    [getFragment]
  )

  const publishLayouts = useCallback(
    (layouts: Record<string, CollabFrameLayout>) => {
      const doc = docRef.current
      if (!doc || !canEdit) return
      setFrameLayouts(doc, layouts, ORIGIN_LOCAL)
      if (boardId) scheduleLayoutSnapshot(boardId, layouts)
    },
    [boardId, canEdit]
  )

  const readLayouts = useCallback(() => {
    const doc = docRef.current
    if (!doc) return {}
    return readAllFrameLayouts(doc)
  }, [])

  const subscribeLayouts = useCallback((cb: (layouts: Record<string, CollabFrameLayout>) => void) => {
    const doc = docRef.current
    if (!doc) return () => {}
    const map = getFramesLayoutMap(doc)
    const handler = () => cb(readAllFrameLayouts(doc))
    map.observe(handler)
    return () => map.unobserve(handler)
  }, [])

  const setCursor = useCallback(
    (flow: { x: number; y: number } | null) => {
      if (!provider || !localUserRef.current) return
      const next = { ...localUserRef.current, cursor: flow }
      localUserRef.current = next
      provider.setAwarenessField('user', next)
    },
    [provider]
  )

  const setSelectedFrames = useCallback(
    (ids: string[]) => {
      if (!provider || !localUserRef.current) return
      const next = { ...localUserRef.current, selectedFrameIds: ids }
      localUserRef.current = next
      provider.setAwarenessField('user', next)
    },
    [provider]
  )

  const claimSeed = useCallback(() => {
    const doc = docRef.current
    if (!doc) return false
    return tryClaimSeed(doc)
  }, [])

  const isSeeded = useCallback(() => {
    const doc = docRef.current
    if (!doc) return false
    return getMetaMap(doc).get('seeded') === true
  }, [])

  const value = useMemo<BoardCollabValue>(
    () => ({
      configured,
      synced,
      doc: configured ? docRef.current : null,
      provider,
      localUser,
      peers,
      canWrite: canEdit,
      getFragment,
      fragmentNeedsSeed,
      publishLayouts,
      readLayouts,
      subscribeLayouts,
      setCursor,
      setSelectedFrames,
      claimSeed,
      isSeeded,
    }),
    [
      configured,
      synced,
      provider,
      localUser,
      peers,
      canEdit,
      getFragment,
      fragmentNeedsSeed,
      publishLayouts,
      readLayouts,
      subscribeLayouts,
      setCursor,
      setSelectedFrames,
      claimSeed,
      isSeeded,
      role,
    ]
  )

  return <BoardCollabContext.Provider value={value}>{children}</BoardCollabContext.Provider>
}

/** Collab session for the open board; safe defaults when outside provider. */
export function useBoardCollab(): BoardCollabValue {
  const ctx = useContext(BoardCollabContext)
  if (ctx) return ctx
  return {
    configured: false,
    synced: false,
    doc: null,
    provider: null,
    localUser: null,
    peers: [],
    canWrite: false,
    getFragment: () => null,
    fragmentNeedsSeed: () => false,
    publishLayouts: () => {},
    readLayouts: () => ({}),
    subscribeLayouts: () => () => {},
    setCursor: () => {},
    setSelectedFrames: () => {},
    claimSeed: () => false,
    isSeeded: () => false,
  }
}

/** Re-export thread map helper for board-flow wiring. */
export { getThreadsMap } from '@/lib/collab/board-doc'

/** Y transaction origin tag for local layout writes. */
export const COLLAB_ORIGIN_LOCAL = 'local'
