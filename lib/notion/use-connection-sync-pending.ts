'use client'

import { useMemo, useSyncExternalStore } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { boardHasPendingConnectionUpdates } from './connection-sync-pending'

type PanelMessage = {
  id: string
  metadata?: Record<string, unknown> | null
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

/** Live pending-sync flag for the current board (messages-for-panels cache). */
export function useConnectionSyncPending(conversationId: string | undefined): boolean {
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

  return useMemo(() => boardHasPendingConnectionUpdates(messages), [messages])
}
