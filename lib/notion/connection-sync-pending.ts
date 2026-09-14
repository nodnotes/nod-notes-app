// Whether any frame on a board has pending Notion → NodNotes updates,
// and whether page-body sync is applicable at all.

import type { QueryClient } from '@tanstack/react-query'
import { notionPageBodySyncTarget } from '@/lib/blocks'

type MessageLike = {
  id?: string
  metadata?: Record<string, unknown> | null
}

/** True when any message metadata has notionUpdatesPending. */
export function boardHasPendingConnectionUpdates(messages: MessageLike[] | undefined | null): boolean {
  if (!messages?.length) return false
  return messages.some((m) => {
    const meta = (m.metadata as Record<string, unknown> | null) || {}
    return meta.notionUpdatesPending === true
  })
}

/** True when the board has at least one imported Notion page eligible for body sync. */
export function boardHasNotionPageSyncTargets(messages: MessageLike[] | undefined | null): boolean {
  if (!messages?.length) return false
  return messages.some((m) => !!notionPageBodySyncTarget(m.metadata))
}

/** Optimistic metadata patch so the top-bar sync icon updates without refetch. */
export function patchBoardMessageMetadata(
  queryClient: QueryClient,
  conversationId: string,
  messageId: string,
  patch: Record<string, unknown>
): void {
  const upd = (list: unknown) => {
    if (!Array.isArray(list)) return list
    return list.map((m) => {
      const row = m as MessageLike
      if (row?.id !== messageId) return m
      return { ...row, metadata: { ...(row.metadata || {}), ...patch } }
    })
  }
  queryClient.setQueriesData({ queryKey: ['messages-for-panels', conversationId] }, upd)
  queryClient.setQueriesData({ queryKey: ['messages-for-panels', conversationId, 'full'] }, upd)
  queryClient.setQueriesData({ queryKey: ['messages-for-panels', conversationId, 'embed'] }, upd)
}
