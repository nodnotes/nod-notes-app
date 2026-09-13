'use client'

// Sync frame create/delete via Y.Doc roster so peers see structural changes without reload

import { useEffect, useRef } from 'react'
import type { QueryClient } from '@tanstack/react-query'
import { useBoardCollab } from '@/lib/collab/board-collab-context'
import {
  getFrameRosterMap,
  readAllRoster,
  syncFrameRoster,
  type CollabFrameRosterEntry,
} from '@/lib/collab/board-doc'
import {
  patchMessagesCache,
  removeMessagesFromCache,
} from '@/lib/board-map-undo-db'

const ORIGIN_LOCAL = 'local-roster'
const REFETCH_DEBOUNCE_MS = 150

type BoardMessage = {
  id: string
  role: 'user' | 'assistant'
  content: string
  created_at?: string
  metadata?: Record<string, unknown> | null
}

function toRosterEntry(m: BoardMessage): CollabFrameRosterEntry {
  return {
    id: m.id,
    role: m.role,
    content: typeof m.content === 'string' ? m.content : '',
    created_at: m.created_at || new Date().toISOString(),
    metadata: (m.metadata as Record<string, unknown>) || {},
  }
}

/**
 * Push local message list into the Y roster; apply remote roster diffs into the
 * messages react-query cache (panels rebuild from structural key).
 */
export function useBoardCollabRoster({
  boardId,
  messages,
  canEdit,
  queryClient,
  refetchMessages,
}: {
  boardId: string | undefined
  messages: BoardMessage[]
  canEdit: boolean
  queryClient: QueryClient
  refetchMessages: () => void
}) {
  const { configured, synced, doc } = useBoardCollab()
  const applyingRemoteRef = useRef(false)
  const refetchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastLocalIdsRef = useRef<string>('')

  // Local → Y: keep roster aligned with this client's message list
  useEffect(() => {
    if (!configured || !synced || !canEdit || !doc || !boardId) return
    if (applyingRemoteRef.current) return
    const idsKey = messages.map((m) => m.id).join(',')
    lastLocalIdsRef.current = idsKey
    syncFrameRoster(doc, messages.map(toRosterEntry), ORIGIN_LOCAL)
  }, [configured, synced, canEdit, doc, boardId, messages])

  // Remote → local: patch cache + debounced refetch for full HTML hydration
  useEffect(() => {
    if (!configured || !synced || !doc || !boardId) return
    const map = getFrameRosterMap(doc)

    const applyRemote = () => {
      if (applyingRemoteRef.current) return
      applyingRemoteRef.current = true
      try {
        const roster = readAllRoster(doc)
        const rosterIds = new Set(roster.map((e) => e.id))
        const cached =
          (queryClient.getQueryData(['messages-for-panels', boardId, 'full']) as
            | BoardMessage[]
            | undefined) ||
          (queryClient.getQueryData(['messages-for-panels', boardId]) as
            | BoardMessage[]
            | undefined) ||
          []
        const cachedIds = new Set(cached.map((m) => m.id))

        const toAdd = roster.filter((e) => !cachedIds.has(e.id))
        const toRemove = cached.filter((m) => !rosterIds.has(m.id)).map((m) => m.id)

        if (toAdd.length > 0) {
          patchMessagesCache(
            queryClient,
            boardId,
            toAdd.map((e) => ({
              id: e.id,
              role: e.role,
              content: e.content || '',
              created_at: e.created_at,
              metadata: e.metadata,
            }))
          )
        }
        if (toRemove.length > 0) {
          removeMessagesFromCache(queryClient, boardId, toRemove)
        }

        // Hydrate content / catch races where DB insert lags the Y broadcast
        if (toAdd.length > 0 || toRemove.length > 0) {
          if (refetchTimerRef.current) clearTimeout(refetchTimerRef.current)
          refetchTimerRef.current = setTimeout(() => {
            refetchMessages()
            // Second pass — creator's INSERT may still be committing
            setTimeout(() => refetchMessages(), 400)
          }, REFETCH_DEBOUNCE_MS)
        }
      } finally {
        queueMicrotask(() => {
          applyingRemoteRef.current = false
        })
      }
    }

    map.observe(applyRemote)
    return () => {
      map.unobserve(applyRemote)
      if (refetchTimerRef.current) clearTimeout(refetchTimerRef.current)
    }
  }, [configured, synced, doc, boardId, queryClient, refetchMessages])
}
