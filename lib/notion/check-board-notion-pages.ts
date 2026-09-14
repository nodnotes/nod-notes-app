// Board-level Notion check + sync review proposals (AI-style pending, grey marks).

import type { QueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { notionPageBodySyncTarget } from '@/lib/blocks'
import {
  boardHasNotionPageSyncTargets,
  patchBoardMessageMetadata,
} from './connection-sync-pending'
import { buildNotionSyncProposedHtml } from './wrap-notion-sync-html'

type PanelMessage = {
  id: string
  content?: string | null
  metadata?: Record<string, unknown> | null
}

/** One frame ready for grey Notion sync review (Save / Remove). */
export type NotionSyncProposal = {
  messageId: string
  pageId: string
  originalContent: string
  proposedContent: string // Marked with data-notion-sync
  lastEditedTime: string
}

export type NotionBoardCheckSummary = {
  checked: number
  updates: number
  applied: number // Kept for toast API — equals proposals.length when apply
  errors: number
  baselines: number
  proposals: NotionSyncProposal[]
}

function readMessages(
  queryClient: QueryClient,
  conversationId: string
): PanelMessage[] {
  return (
    queryClient.getQueryData<PanelMessage[]>(['messages-for-panels', conversationId, 'full']) ??
    queryClient.getQueryData<PanelMessage[]>(['messages-for-panels', conversationId]) ??
    []
  )
}

async function persistMessageMeta(messageId: string, patch: Record<string, unknown>): Promise<void> {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('messages')
    .select('metadata')
    .eq('id', messageId)
    .single()
  if (error || !data) return
  const existing = (data.metadata as Record<string, unknown> | null) || {}
  await supabase
    .from('messages')
    .update({ metadata: { ...existing, ...patch } })
    .eq('id', messageId)
}

export type CheckBoardNotionPagesOpts = {
  /**
   * When true, build review proposals (marked HTML) instead of detect-only flags.
   * Content is NOT written until the user Saves in the review bar.
   */
  apply?: boolean
}

/** Check every Notion page-body target; optionally build sync-review proposals. */
export async function checkBoardNotionPages(
  queryClient: QueryClient,
  conversationId: string,
  opts: CheckBoardNotionPagesOpts = {}
): Promise<NotionBoardCheckSummary> {
  const apply = opts.apply === true
  const messages = readMessages(queryClient, conversationId)
  if (!boardHasNotionPageSyncTargets(messages)) {
    return { checked: 0, updates: 0, applied: 0, errors: 0, baselines: 0, proposals: [] }
  }

  let checked = 0
  let updates = 0
  let errors = 0
  let baselines = 0
  const proposals: NotionSyncProposal[] = []

  await Promise.all(
    messages.map(async (msg) => {
      const target = notionPageBodySyncTarget(msg.metadata)
      if (!target || !msg.id) return
      const meta = (msg.metadata as Record<string, unknown> | null) || {}
      const local =
        typeof meta.notionLastEditedTime === 'string' ? meta.notionLastEditedTime : null
      const wasPending = meta.notionUpdatesPending === true
      try {
        const res = await fetch(`/api/notion/page/${encodeURIComponent(target.pageId)}/content`)
        const json = (await res.json().catch(() => ({}))) as {
          lastEditedTime?: string | null
          html?: string
          error?: string
        }
        if (!res.ok || !json.lastEditedTime) {
          errors += 1
          checked += 1
          return
        }
        const remoteTime = json.lastEditedTime
        checked += 1

        if (!local) {
          const patch = { notionLastEditedTime: remoteTime, notionUpdatesPending: false }
          patchBoardMessageMetadata(queryClient, conversationId, msg.id, patch)
          void persistMessageMeta(msg.id, patch)
          baselines += 1
          return
        }

        const remoteNewer = remoteTime > local
        if (!remoteNewer && !wasPending) return
        if (!remoteNewer && wasPending) {
          const patch = { notionUpdatesPending: false }
          patchBoardMessageMetadata(queryClient, conversationId, msg.id, patch)
          void persistMessageMeta(msg.id, patch)
          return
        }

        updates += 1

        if (!apply || typeof json.html !== 'string') {
          const patch = {
            notionUpdatesPending: true,
            notionRemoteLastEditedTime: remoteTime,
          }
          patchBoardMessageMetadata(queryClient, conversationId, msg.id, patch)
          void persistMessageMeta(msg.id, patch)
          return
        }

        // Review proposal — keep DB content as original until Save
        const originalContent =
          typeof msg.content === 'string' ? msg.content : ''
        proposals.push({
          messageId: msg.id,
          pageId: target.pageId,
          originalContent,
          proposedContent: buildNotionSyncProposedHtml(originalContent, json.html),
          lastEditedTime: remoteTime,
        })
        const patch = {
          notionUpdatesPending: true,
          notionRemoteLastEditedTime: remoteTime,
          notionSyncReview: true,
        }
        patchBoardMessageMetadata(queryClient, conversationId, msg.id, patch)
        void persistMessageMeta(msg.id, patch)
      } catch {
        errors += 1
        checked += 1
      }
    })
  )

  return {
    checked,
    updates,
    applied: proposals.length,
    errors,
    baselines,
    proposals,
  }
}
