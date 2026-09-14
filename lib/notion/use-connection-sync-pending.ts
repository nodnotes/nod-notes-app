'use client'

import { useMemo, useSyncExternalStore } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import {
  boardHasNotionPageSyncTargets,
  boardHasPendingConnectionUpdates,
} from './connection-sync-pending'

type PanelMessage = {
  id: string
  metadata?: Record<string, unknown> | null
}

export type ConnectionSyncIconState = {
  pending: boolean // Detected newer Notion edit → blue
  applicable: boolean // Has page-body sync targets → normal / clickable
}

function readPanelMessages(
  queryClient: ReturnType<typeof useQueryClient>,
  conversationId: string | undefined
): PanelMessage[] | undefined {
  if (!conversationId) return undefined
  return (
    queryClient.getQueryData<PanelMessage[]>(['messages-for-panels', conversationId, 'full']) ??
    queryClient.getQueryData<PanelMessage[]>(['messages-for-panels', conversationId])
  )
}

/** Live sync-icon flags for the current board (messages-for-panels cache). */
export function useConnectionSyncPending(
  conversationId: string | undefined
): ConnectionSyncIconState {
  const queryClient = useQueryClient()

  const messages = useSyncExternalStore(
    (onStoreChange) => {
      if (!conversationId) return () => {}
      return queryClient.getQueryCache().subscribe((event) => {
        const key = event?.query?.queryKey
        if (
          Array.isArray(key) &&
          key[0] === 'messages-for-panels' &&
          key[1] === conversationId
        ) {
          onStoreChange()
        }
      })
    },
    () => readPanelMessages(queryClient, conversationId),
    () => undefined
  )

  return useMemo(
    () => ({
      pending: boardHasPendingConnectionUpdates(messages),
      applicable: boardHasNotionPageSyncTargets(messages),
    }),
    [messages]
  )
}
