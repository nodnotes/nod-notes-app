'use client'

// Shared row/frame Convert layout for Notion DB tables (live table + static preview).

import { useCallback, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import type { DbConvertLayoutId } from '@/components/block-actions-menu'
import { createClient } from '@/lib/supabase/client'
import {
  collectRowsForCardConvert,
  resolveParentRelationProperty,
  rowIsNestedOrParent,
  type CardConvertBringPrefs,
} from '@/lib/notion/card-convert-bring'
import { setGroupLocked, setSideStackEntry, sideStackGroupId } from '@/lib/frame-side-stacks'
import type { NotionDatabaseTable } from '@/lib/notion/database'
import { rowTitleFromCells } from '@/lib/notion/property-map'
import {
  appendPeeledCardToMessagesCache,
  appendPeeledPageIdsOnHostFrame,
  createRowCardOnBoard,
} from '@/lib/notion/row-to-card-client'

export function useNotionDbConvertLayout(opts: {
  notionDatabaseId: string
  conversationId: string | null
  hostMessageId: string | null
  data: NotionDatabaseTable | null | undefined
  relationProperty: string | null | undefined
  onMessagesCacheBump?: () => void
}) {
  const {
    notionDatabaseId,
    conversationId,
    hostMessageId,
    data,
    relationProperty,
    onMessagesCacheBump,
  } = opts
  const queryClient = useQueryClient()
  const tableQueryKey = ['notion-database', notionDatabaseId] as const
  const [bringDialogRowId, setBringDialogRowId] = useState<string | null>(null)

  const setCachedTable = useCallback(
    (updater: (prev: NotionDatabaseTable | null) => NotionDatabaseTable | null) => {
      queryClient.setQueryData<NotionDatabaseTable>(tableQueryKey, (prev) => {
        const next = updater(prev ?? null)
        return next === null ? prev : next
      })
    },
    [queryClient, tableQueryKey]
  )

  const convertRowsToCards = useCallback(
    async (primaryRowId: string, prefs: CardConvertBringPrefs) => {
      if (!conversationId || !data || !notionDatabaseId) {
        console.error('Convert layout: missing board or table data', {
          conversationId,
          hasData: !!data,
        })
        return
      }
      const primary = data.rows.find((r) => r.id === primaryRowId)
      if (!primary) {
        console.error('Convert layout: row not in loaded table', primaryRowId)
        return
      }
      try {
        const supabase = createClient()
        const {
          data: { user },
        } = await supabase.auth.getUser()
        if (!user) return

        let origin = { x: 80, y: 80 }
        if (hostMessageId) {
          const { data: hostMsg } = await supabase
            .from('messages')
            .select('metadata')
            .eq('id', hostMessageId)
            .maybeSingle()
          const pos = (hostMsg?.metadata as { position?: { x?: number; y?: number } } | null)
            ?.position
          if (typeof pos?.x === 'number' && typeof pos?.y === 'number') {
            origin = { x: pos.x, y: pos.y }
          }
        }

        const parentRelation = resolveParentRelationProperty(data.properties, relationProperty)
        const { ordered } = collectRowsForCardConvert({
          primary,
          allRows: data.rows,
          parentRelation,
          prefs,
        })
        const hostCardId = crypto.randomUUID()
        const stackSide = 'bottom' as const
        const stackGroupId =
          ordered.length > 1 ? sideStackGroupId(hostCardId, stackSide) : null
        const position = { x: origin.x + 320, y: origin.y }

        for (let i = 0; i < ordered.length; i++) {
          const cardMessageId = i === 0 ? hostCardId : crypto.randomUUID()
          let frameMetadataExtras: Record<string, unknown> | undefined
          if (stackGroupId) {
            let meta = setSideStackEntry(
              {},
              stackSide,
              i === 0
                ? { groupId: stackGroupId, index: 0, anchor: true, expanded: true }
                : { groupId: stackGroupId, index: i, expanded: false }
            )
            meta = setGroupLocked(meta, stackGroupId, true)
            frameMetadataExtras = meta
          }
          const { cacheMessage } = await createRowCardOnBoard({
            supabase,
            userId: user.id,
            conversationId,
            sourceMessageId: hostMessageId || undefined,
            notionDatabaseId,
            databaseTitle: data.title,
            properties: data.properties,
            row: ordered[i],
            origin,
            position,
            cardMessageId,
            frameMetadataExtras,
          })
          appendPeeledCardToMessagesCache(queryClient, conversationId, cacheMessage)
        }

        onMessagesCacheBump?.()

        if (hostMessageId) {
          await appendPeeledPageIdsOnHostFrame({
            supabase,
            hostMessageId,
            pageIds: ordered.map((r) => r.id),
            queryClient,
            conversationId,
          })
          onMessagesCacheBump?.()
        }

        const peeled = new Set(ordered.map((r) => r.id.replace(/-/g, '').toLowerCase()))
        setCachedTable((prev) => {
          if (!prev) return prev
          return {
            ...prev,
            rows: prev.rows.filter((r) => !peeled.has(r.id.replace(/-/g, '').toLowerCase())),
          }
        })

        await queryClient.invalidateQueries({ queryKey: ['messages-for-panels', conversationId] })
        await queryClient.refetchQueries({ queryKey: ['messages-for-panels', conversationId] })
        await queryClient.invalidateQueries({ queryKey: ['panel-edges', conversationId] })
        await queryClient.refetchQueries({ queryKey: ['panel-edges', conversationId] })
        await queryClient.invalidateQueries({ queryKey: ['conversations'] })
      } catch (err) {
        console.error('Convert row to card failed:', err)
      }
    },
    [
      conversationId,
      hostMessageId,
      notionDatabaseId,
      data,
      queryClient,
      relationProperty,
      setCachedTable,
      onMessagesCacheBump,
    ]
  )

  const handleConvertLayout = useCallback(
    async (layout: DbConvertLayoutId, rowId?: string) => {
      if (layout !== 'card' || !rowId) {
        if (!conversationId || !hostMessageId || !notionDatabaseId) return
        try {
          const res = await fetch(
            `/api/notion/database/${encodeURIComponent(notionDatabaseId)}/convert-layout`,
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ layout, conversationId, sourceMessageId: hostMessageId }),
            }
          )
          if (!res.ok) {
            const json = (await res.json().catch(() => ({}))) as { error?: string }
            console.error('Convert layout failed:', json.error || res.statusText)
            return
          }
          await queryClient.invalidateQueries({ queryKey: ['messages-for-panels', conversationId] })
          await queryClient.refetchQueries({ queryKey: ['messages-for-panels', conversationId] })
          await queryClient.invalidateQueries({ queryKey: ['panel-edges', conversationId] })
          await queryClient.refetchQueries({ queryKey: ['panel-edges', conversationId] })
        } catch (err) {
          console.error('Convert layout failed:', err)
        }
        return
      }

      if (!data) {
        console.error('Convert layout: missing table data')
        return
      }
      const row = data.rows.find((r) => r.id === rowId)
      if (!row) {
        console.error('Convert layout: row not in loaded table', rowId)
        return
      }
      const parentRelation = resolveParentRelationProperty(data.properties, relationProperty)
      if (rowIsNestedOrParent(row, data.rows, parentRelation)) {
        setBringDialogRowId(rowId)
        return
      }
      await convertRowsToCards(rowId, { subRows: false, parentRows: false })
    },
    [
      conversationId,
      hostMessageId,
      notionDatabaseId,
      data,
      queryClient,
      relationProperty,
      convertRowsToCards,
    ]
  )

  const bringDialogRow = bringDialogRowId
    ? data?.rows.find((r) => r.id === bringDialogRowId) || null
    : null
  const bringDialogTitle = bringDialogRow
    ? rowTitleFromCells(data?.properties ?? [], bringDialogRow.cells)
    : undefined

  return {
    handleConvertLayout,
    bringDialogRowId,
    setBringDialogRowId,
    convertRowsToCards,
    bringDialogTitle,
  }
}
