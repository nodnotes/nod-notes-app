// Board-level Notion check + sync review proposals (AI-style pending, grey marks).

import type { QueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { htmlToPlainLoose } from '@/lib/ai/apply-replacements'
import { notionPageBodySyncTarget } from '@/lib/blocks'
import {
  boardHasNotionPageSyncTargets,
  patchBoardMessageMetadata,
} from './connection-sync-pending'
import {
  buildNotionSyncProposedHtml,
  sanitizeNotionSyncHtml,
} from './wrap-notion-sync-html'

/** True when local vs Notion body text still differs (ignores markup noise). */
function notionBodiesVisiblyDiffer(localHtml: string, remoteHtml: string): boolean {
  // Unwrap review marks so a mid-review cache hit doesn’t look “equal” to Notion
  const norm = (h: string) =>
    htmlToPlainLoose(sanitizeNotionSyncHtml(h || '')).replace(/\s+/g, ' ').trim()
  return norm(localHtml) !== norm(remoteHtml)
}

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

/** Write cleaned frame HTML (heals leftover review marks). */
async function persistMessageContent(messageId: string, content: string): Promise<void> {
  const supabase = createClient()
  await supabase.from('messages').update({ content }).eq('id', messageId)
}

/** Optimistic content patch alongside metadata helpers. */
function patchBoardMessageContent(
  queryClient: QueryClient,
  conversationId: string,
  messageId: string,
  content: string
): void {
  const upd = (list: unknown) => {
    if (!Array.isArray(list)) return list
    return list.map((m) => {
      const row = m as PanelMessage
      if (row?.id !== messageId) return m
      return { ...row, content }
    })
  }
  queryClient.setQueriesData({ queryKey: ['messages-for-panels', conversationId] }, upd)
  queryClient.setQueriesData({ queryKey: ['messages-for-panels', conversationId, 'full'] }, upd)
  queryClient.setQueriesData({ queryKey: ['messages-for-panels', conversationId, 'embed'] }, upd)
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
        const rawContent = typeof msg.content === 'string' ? msg.content : ''
        // Heal leftover grey marks from a prior Keep mine / cancel that didn’t unwrap
        const originalContent = sanitizeNotionSyncHtml(rawContent)
        if (originalContent !== rawContent || meta.notionSyncReview === true) {
          if (originalContent !== rawContent) {
            patchBoardMessageContent(queryClient, conversationId, msg.id, originalContent)
            void persistMessageContent(msg.id, originalContent)
          }
          // Clear orphan review flags when content is healed (no active proposal yet)
          if (meta.notionSyncReview === true && !apply) {
            const clearReview = { notionSyncReview: false, notionUpdatesPending: false }
            patchBoardMessageMetadata(queryClient, conversationId, msg.id, clearReview)
            void persistMessageMeta(msg.id, clearReview)
          } else if (
            originalContent !== rawContent &&
            meta.notionSyncReview === true &&
            meta.notionUpdatesPending !== true
          ) {
            const clearReview = { notionSyncReview: false }
            patchBoardMessageMetadata(queryClient, conversationId, msg.id, clearReview)
            void persistMessageMeta(msg.id, clearReview)
          }
        }
        // Keep mine advances lastEditedTime so background poll stays quiet; manual
        // sync still re-opens review when the Notion body text still differs.
        const bodyDiffers =
          apply && typeof json.html === 'string'
            ? notionBodiesVisiblyDiffer(originalContent, json.html)
            : false

        if (!remoteNewer && !bodyDiffers) {
          if (wasPending) {
            const patch = { notionUpdatesPending: false, notionSyncReview: false }
            patchBoardMessageMetadata(queryClient, conversationId, msg.id, patch)
            void persistMessageMeta(msg.id, patch)
          }
          return
        }

        updates += 1

        if (!apply || typeof json.html !== 'string') {
          // Detect-only (or missing html): flag pending only when Notion is newer
          if (!remoteNewer) return
          const patch = {
            notionUpdatesPending: true,
            notionRemoteLastEditedTime: remoteTime,
          }
          patchBoardMessageMetadata(queryClient, conversationId, msg.id, patch)
          void persistMessageMeta(msg.id, patch)
          return
        }

        // Remote newer but body text matches — advance baseline, no review UI
        if (!bodyDiffers) {
          const patch = {
            notionLastEditedTime: remoteTime,
            notionUpdatesPending: false,
            notionSyncReview: false,
            notionRemoteLastEditedTime: remoteTime,
          }
          patchBoardMessageMetadata(queryClient, conversationId, msg.id, patch)
          void persistMessageMeta(msg.id, patch)
          return
        }

        // Review proposal — keep DB content as original until Accept / Keep mine
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
