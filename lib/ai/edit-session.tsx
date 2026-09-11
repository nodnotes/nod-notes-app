'use client'

// Pending AI edit session — originals stay in DB until Save; eye/remove use in-memory proposals
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { createClient } from '@/lib/supabase/client'
import { htmlHasAiOrigin, htmlHasAiPending, promotePendingToOrigin } from '@/lib/ai/wrap-ai-html'
import { useQueryClient } from '@tanstack/react-query'
import {
  buildProposedHtml,
  type AiTextReplacement,
} from '@/lib/ai/apply-replacements'
import { generateUUID } from '@/lib/utils'
import { frameColorMetaPatch } from '@/lib/frame-colors'

/** Input for queueing a pending edit — proposed HTML is built after re-reading DB original. */
export type AiPendingEditInput = {
  kind: AiPendingEditKind
  messageId?: string
  edgeId?: string
  /** create_thread endpoints (for discard cleanup when a create_frame is removed). */
  sourceFrameId?: string
  targetFrameId?: string
  summary: string
  /** Hint only — live DB content wins for update_frame. */
  originalContent?: string
  /** Pre-built proposal (skips rebuild). */
  proposedContent?: string
  contentHtml?: string
  replacements?: AiTextReplacement[]
  actionLogId?: string
  /** When set, frame fill/border were changed (or will be applied client-side). */
  fillColor?: string
  borderColor?: string
  originalFillColor?: string
  originalBorderColor?: string
  /** True when this edit includes a color change (including clear → default). */
  colorChanged?: boolean
}

export type AiPendingEditKind = 'update_frame' | 'create_frame' | 'create_thread' | 'update_thread'

export interface AiPendingEdit {
  id: string
  kind: AiPendingEditKind
  messageId?: string
  edgeId?: string
  sourceFrameId?: string
  targetFrameId?: string
  summary: string
  /** Exact page content before the proposal (never written over until discard/save resolves). */
  originalContent: string
  /** Proposed HTML with ai-pending marks (shown on page until save/discard). */
  proposedContent: string
  actionLogId?: string
  /** Proposed chrome colors (undefined = this edit did not touch color). */
  fillColor?: string
  borderColor?: string
  originalFillColor?: string
  originalBorderColor?: string
  colorChanged?: boolean
}

interface AiEditSessionValue {
  pendingEdits: AiPendingEdit[]
  previewOriginal: boolean
  showAiOrigin: boolean
  /** Board has persisted AI-origin spans (top-bar toggle only when true). */
  hasAiContent: boolean
  /** Sparkles control pinned left of Share; default unpinned → lives in More menu. */
  aiTopBarPinned: boolean
  focusedEditId: string | null
  /** messageId → original HTML right after Remove (panel consumes once). */
  justRestoredByMessage: Record<string, string>
  setShowAiOrigin: (v: boolean) => void
  setAiTopBarPinned: (pinned: boolean) => void
  setPreviewOriginal: (v: boolean) => void
  setFocusedEditId: (id: string | null) => void
  consumeRestoredContent: (messageId: string) => void
  addPendingEdits: (edits: AiPendingEditInput[]) => void | Promise<void>
  saveEdit: (id: string) => Promise<void>
  discardEdit: (id: string) => Promise<void>
  saveAll: () => Promise<void>
  discardAll: () => Promise<void>
  displayContentFor: (messageId: string, liveContent: string) => string
  isFramePending: (messageId: string) => boolean
  isThreadPending: (edgeId: string) => boolean
  pendingForMessage: (messageId: string) => AiPendingEdit | undefined
}

const AiEditSessionContext = createContext<AiEditSessionValue | null>(null)

const SHOW_AI_ORIGIN_KEY = 'nodnotes-show-ai-origin'
const AI_TOPBAR_PIN_KEY = 'nodnotes-ai-topbar-pinned'

/** Default unpinned — AI highlight toggle starts in More menu. */
function readAiTopBarPinned(): boolean {
  if (typeof window === 'undefined') return false
  try {
    const raw = window.localStorage.getItem(AI_TOPBAR_PIN_KEY)
    if (raw === null) return false
    return raw !== '0' && raw !== 'false'
  } catch {
    return false
  }
}

function bumpMessages(detail?: {
  contentUpdates?: Array<{ messageId: string; content: string }>
}) {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('ai-edits-mutated', { detail }))
  }
}

async function markActionStatus(actionLogId: string | undefined, status: 'applied' | 'undone') {
  if (!actionLogId) return
  const supabase = createClient()
  await supabase.from('ai_action_log').update({ status }).eq('id', actionLogId)
}

export function AiEditSessionProvider({
  children,
  conversationId,
  onMessagesMutated,
}: {
  children: ReactNode
  conversationId?: string
  onMessagesMutated?: () => void
}) {
  const queryClient = useQueryClient()
  const [pendingEdits, setPendingEdits] = useState<AiPendingEdit[]>([])
  const [previewOriginal, setPreviewOriginalState] = useState(false)
  const [focusedEditId, setFocusedEditId] = useState<string | null>(null)
  const [showAiOrigin, setShowAiOriginState] = useState(false)
  const [hasAiContent, setHasAiContent] = useState(false)
  const [aiTopBarPinned, setAiTopBarPinnedState] = useState(false)
  const [justRestoredByMessage, setJustRestoredByMessage] = useState<Record<string, string>>({})

  const scanHasAiContent = useCallback(() => {
    if (pendingEdits.length > 0) return true
    if (!conversationId) return false
    const msgs =
      (queryClient.getQueryData([
        'messages-for-panels',
        conversationId,
        'full',
      ]) as Array<{ content?: string; metadata?: Record<string, unknown> }> | undefined) ||
      (queryClient.getQueryData([
        'messages-for-panels',
        conversationId,
        'embed',
      ]) as Array<{ content?: string; metadata?: Record<string, unknown> }> | undefined) ||
      (queryClient.getQueryData([
        'messages-for-panels',
        conversationId,
      ]) as Array<{ content?: string; metadata?: Record<string, unknown> }> | undefined) ||
      []
    return msgs.some((m) => {
      const meta = (m.metadata || {}) as Record<string, unknown>
      if (meta.hasAiOrigin === true) return true
      return htmlHasAiOrigin(m.content) || htmlHasAiPending(m.content)
    })
  }, [conversationId, pendingEdits, queryClient])

  const consumeRestoredContent = useCallback((messageId: string) => {
    setJustRestoredByMessage((prev) => {
      if (!(messageId in prev)) return prev
      const next = { ...prev }
      delete next[messageId]
      return next
    })
  }, [])

  useEffect(() => {
    try {
      const on = localStorage.getItem(SHOW_AI_ORIGIN_KEY) === '1'
      setShowAiOriginState(on)
      document.documentElement.classList.toggle('tt-show-ai-origin', on)
    } catch {
      /* ignore */
    }
    setAiTopBarPinnedState(readAiTopBarPinned())
  }, [])

  useEffect(() => {
    if (!conversationId) {
      setHasAiContent(false)
      return
    }
    const apply = () => setHasAiContent(scanHasAiContent())
    apply()
    const unsub = queryClient.getQueryCache().subscribe((event) => {
      const key = event?.query?.queryKey
      if (!Array.isArray(key) || key[0] !== 'messages-for-panels' || key[1] !== conversationId) return
      apply()
    })
    window.addEventListener('ai-edits-mutated', apply)
    // Messages often land after the provider mounts — rescan once the board query settles
    const t1 = window.setTimeout(apply, 400)
    const t2 = window.setTimeout(apply, 1200)
    return () => {
      unsub()
      window.removeEventListener('ai-edits-mutated', apply)
      window.clearTimeout(t1)
      window.clearTimeout(t2)
    }
  }, [conversationId, queryClient, scanHasAiContent])

  const setShowAiOrigin = useCallback((v: boolean) => {
    setShowAiOriginState(v)
    try {
      localStorage.setItem(SHOW_AI_ORIGIN_KEY, v ? '1' : '0')
    } catch {
      /* ignore */
    }
    document.documentElement.classList.toggle('tt-show-ai-origin', v)
  }, [])

  useEffect(() => {
    if (!hasAiContent && showAiOrigin) setShowAiOrigin(false)
  }, [hasAiContent, showAiOrigin, setShowAiOrigin])

  const setAiTopBarPinned = useCallback((pinned: boolean) => {
    setAiTopBarPinnedState(pinned)
    try {
      window.localStorage.setItem(AI_TOPBAR_PIN_KEY, pinned ? '1' : '0')
    } catch {
      /* ignore */
    }
  }, [])

  const setPreviewOriginal = useCallback((v: boolean) => {
    setPreviewOriginalState(v)
  }, [])

  const persistFrameContent = useCallback(async (messageId: string, content: string) => {
    const supabase = createClient()
    const { error } = await supabase.from('messages').update({ content }).eq('id', messageId)
    if (error) throw error
  }, [])

  const persistFrameMeta = useCallback(
    async (messageId: string, patch: Record<string, unknown>) => {
      const supabase = createClient()
      const { data } = await supabase.from('messages').select('metadata').eq('id', messageId).single()
      const meta = { ...((data?.metadata as Record<string, unknown>) || {}), ...patch }
      const { error } = await supabase.from('messages').update({ metadata: meta }).eq('id', messageId)
      if (error) throw error
    },
    []
  )

  const deleteFrame = useCallback(async (messageId: string) => {
    const supabase = createClient()
    // panel_edges cascade on message delete
    const { error } = await supabase.from('messages').delete().eq('id', messageId)
    if (error) throw error
  }, [])

  const deleteEdge = useCallback(async (edgeId: string) => {
    const supabase = createClient()
    // Ignore missing row (cascade already removed it with a create_frame discard)
    await supabase.from('panel_edges').delete().eq('id', edgeId)
  }, [])

  // Eye toggle: swap fill/border between proposed and original for color edits
  useEffect(() => {
    const colorEdits = pendingEdits.filter(
      (e) => e.colorChanged && e.kind === 'update_frame' && e.messageId
    )
    if (colorEdits.length === 0) return
    let cancelled = false
    void (async () => {
      for (const edit of colorEdits) {
        if (cancelled || !edit.messageId) continue
        const fill = previewOriginal ? (edit.originalFillColor ?? '') : (edit.fillColor ?? '')
        const border = previewOriginal
          ? (edit.originalBorderColor ?? '')
          : (edit.borderColor ?? '')
        await persistFrameMeta(edit.messageId, frameColorMetaPatch(fill, border))
      }
      if (!cancelled) bumpMessages()
    })()
    return () => {
      cancelled = true
    }
  }, [previewOriginal, pendingEdits, persistFrameMeta])

  /** Queue proposals in memory only — DB keeps original until Save (creates already inserted). */
  const addPendingEdits = useCallback(
    async (edits: AiPendingEditInput[]) => {
      const supabase = createClient()
      const withIds: AiPendingEdit[] = []

      for (const e of edits) {
        if (e.kind === 'create_thread') {
          withIds.push({
            id: generateUUID(),
            kind: 'create_thread',
            edgeId: e.edgeId,
            sourceFrameId: e.sourceFrameId,
            targetFrameId: e.targetFrameId,
            summary: e.summary,
            originalContent: '',
            proposedContent: '',
            actionLogId: e.actionLogId,
          })
          continue
        }

        if (e.kind === 'create_frame') {
          const proposed = e.proposedContent || e.contentHtml || ''
          withIds.push({
            id: generateUUID(),
            kind: 'create_frame',
            messageId: e.messageId,
            summary: e.summary,
            originalContent: '',
            proposedContent: proposed,
            actionLogId: e.actionLogId,
            fillColor: e.fillColor,
            borderColor: e.borderColor,
            colorChanged: e.colorChanged,
          })
          continue
        }

        let original = e.originalContent || ''
        // Always re-read live DB content as source of truth for original (ignore stale SSE)
        if (e.kind === 'update_frame' && e.messageId) {
          const { data: msg } = await supabase
            .from('messages')
            .select('content')
            .eq('id', e.messageId)
            .maybeSingle()
          if (typeof msg?.content === 'string') original = msg.content
          // Soft-flag metadata for chrome without mutating content
          const metaPatch: Record<string, unknown> = { aiPendingEdit: true }
          // Server may have already applied color; client re-applies for race safety
          if (e.colorChanged) {
            Object.assign(
              metaPatch,
              frameColorMetaPatch(e.fillColor ?? '', e.borderColor ?? '')
            )
          }
          await persistFrameMeta(e.messageId, metaPatch)
        }
        // Build proposal against the live original so eye/remove match DB
        const hasTextChange =
          Boolean(e.contentHtml?.trim()) ||
          Boolean(e.replacements?.some((r) => (r.oldText || '').trim()))
        const proposed =
          e.proposedContent ||
          // Color-only: keep HTML identical (no full-frame pending wrap)
          (e.colorChanged && !hasTextChange
            ? original
            : buildProposedHtml({
                originalHtml: original,
                contentHtml: e.contentHtml,
                replacements: e.replacements,
              }))
        withIds.push({
          id: generateUUID(),
          kind: e.kind,
          messageId: e.messageId,
          edgeId: e.edgeId,
          summary: e.summary,
          originalContent: original,
          proposedContent: proposed,
          actionLogId: e.actionLogId,
          fillColor: e.fillColor,
          borderColor: e.borderColor,
          originalFillColor: e.originalFillColor,
          originalBorderColor: e.originalBorderColor,
          colorChanged: e.colorChanged,
        })
      }

      setPendingEdits((prev) => {
        // Replace any existing pending for the same frame (latest proposal wins)
        const withoutDupes = prev.filter(
          (p) =>
            !withIds.some(
              (n) =>
                (n.messageId && n.messageId === p.messageId) ||
                (n.edgeId && n.edgeId === p.edgeId)
            )
        )
        return [...withoutDupes, ...withIds]
      })
      setPreviewOriginal(false)
      onMessagesMutated?.()
      bumpMessages()
    },
    [persistFrameMeta, onMessagesMutated]
  )

  const applySaveOne = useCallback(
    async (edit: AiPendingEdit): Promise<{ messageId?: string; content?: string }> => {
      if (edit.kind === 'update_frame' && edit.messageId) {
        const textChanged = edit.proposedContent !== edit.originalContent
        const finalHtml = textChanged
          ? promotePendingToOrigin(edit.proposedContent)
          : edit.originalContent
        await persistFrameContent(edit.messageId, finalHtml)
        const metaPatch: Record<string, unknown> = { aiPendingEdit: false }
        if (textChanged) metaPatch.hasAiOrigin = true
        // Eye preview may have restored originals — force proposed colors on Save
        if (edit.colorChanged) {
          Object.assign(
            metaPatch,
            frameColorMetaPatch(edit.fillColor ?? '', edit.borderColor ?? '')
          )
        }
        await persistFrameMeta(edit.messageId, metaPatch)
        await markActionStatus(edit.actionLogId, 'applied')
        return { messageId: edit.messageId, content: finalHtml }
      }
      if (edit.kind === 'create_frame' && edit.messageId) {
        const finalHtml = promotePendingToOrigin(edit.proposedContent)
        await persistFrameContent(edit.messageId, finalHtml)
        await persistFrameMeta(edit.messageId, {
          aiPendingEdit: false,
          hasAiOrigin: true,
        })
        await markActionStatus(edit.actionLogId, 'applied')
        return { messageId: edit.messageId, content: finalHtml }
      }
      if (edit.kind === 'create_thread' && edit.edgeId) {
        await markActionStatus(edit.actionLogId, 'applied')
      }
      return {}
    },
    [persistFrameContent, persistFrameMeta]
  )

  const applyDiscardOne = useCallback(
    async (edit: AiPendingEdit): Promise<{ messageId?: string; content?: string; deleted?: boolean }> => {
      if (edit.kind === 'update_frame' && edit.messageId) {
        const metaPatch: Record<string, unknown> = { aiPendingEdit: false }
        if (edit.colorChanged) {
          Object.assign(
            metaPatch,
            frameColorMetaPatch(edit.originalFillColor ?? '', edit.originalBorderColor ?? '')
          )
        }
        await persistFrameMeta(edit.messageId, metaPatch)
        await persistFrameContent(edit.messageId, edit.originalContent)
        await markActionStatus(edit.actionLogId, 'undone')
        return { messageId: edit.messageId, content: edit.originalContent }
      }
      if (edit.kind === 'create_frame' && edit.messageId) {
        await deleteFrame(edit.messageId)
        await markActionStatus(edit.actionLogId, 'undone')
        return { messageId: edit.messageId, deleted: true }
      }
      if (edit.kind === 'create_thread' && edit.edgeId) {
        await deleteEdge(edit.edgeId)
        await markActionStatus(edit.actionLogId, 'undone')
      }
      return {}
    },
    [persistFrameContent, persistFrameMeta, deleteFrame, deleteEdge]
  )

  const saveEdit = useCallback(
    async (id: string) => {
      const edit = pendingEdits.find((e) => e.id === id)
      if (!edit) return
      const result = await applySaveOne(edit)
      setPendingEdits((prev) => prev.filter((e) => e.id !== id))
      if (focusedEditId === id) setFocusedEditId(null)
      if (result.messageId && result.content) {
        setJustRestoredByMessage((prev) => ({
          ...prev,
          [result.messageId!]: result.content!,
        }))
      }
      onMessagesMutated?.()
      bumpMessages(
        result.messageId && result.content
          ? {
              contentUpdates: [{ messageId: result.messageId, content: result.content }],
            }
          : undefined
      )
    },
    [pendingEdits, applySaveOne, focusedEditId, onMessagesMutated]
  )

  const discardEdit = useCallback(
    async (id: string) => {
      const edit = pendingEdits.find((e) => e.id === id)
      if (!edit) return
      const result = await applyDiscardOne(edit)

      // Frame delete cascades panel_edges — clear thread pendings attached to this frame
      const orphanThreadIds: string[] = []
      if (edit.kind === 'create_frame' && edit.messageId) {
        for (const t of pendingEdits) {
          if (t.kind !== 'create_thread' || t.id === id) continue
          const touches =
            t.sourceFrameId === edit.messageId || t.targetFrameId === edit.messageId
          if (!touches) continue
          if (t.edgeId) await deleteEdge(t.edgeId)
          await markActionStatus(t.actionLogId, 'undone')
          orphanThreadIds.push(t.id)
        }
      }

      setPendingEdits((prev) =>
        prev.filter((e) => e.id !== id && !orphanThreadIds.includes(e.id))
      )

      if (focusedEditId === id) setFocusedEditId(null)
      setPreviewOriginal(false)
      if (result.messageId && result.content && !result.deleted) {
        setJustRestoredByMessage((prev) => ({
          ...prev,
          [result.messageId!]: result.content!,
        }))
      }
      onMessagesMutated?.()
      bumpMessages(
        result.messageId && result.content && !result.deleted
          ? { contentUpdates: [{ messageId: result.messageId, content: result.content }] }
          : undefined
      )
    },
    [pendingEdits, applyDiscardOne, deleteEdge, focusedEditId, onMessagesMutated]
  )

  const saveAll = useCallback(async () => {
    const snapshot = [...pendingEdits]
    const restored: Record<string, string> = {}
    for (const edit of snapshot) {
      const result = await applySaveOne(edit)
      if (result.messageId && result.content) {
        restored[result.messageId] = result.content
      }
    }
    setJustRestoredByMessage((prev) => ({ ...prev, ...restored }))
    setPendingEdits([])
    setFocusedEditId(null)
    setPreviewOriginal(false)
    onMessagesMutated?.()
    bumpMessages({
      contentUpdates: Object.entries(restored).map(([messageId, content]) => ({
        messageId,
        content,
      })),
    })
  }, [pendingEdits, applySaveOne, onMessagesMutated])

  const discardAll = useCallback(async () => {
    const snapshot = [...pendingEdits]
    const restored: Record<string, string> = {}
    // Discard creates first (frames cascade threads), then updates
    const ordered = [
      ...snapshot.filter((e) => e.kind === 'create_thread'),
      ...snapshot.filter((e) => e.kind === 'create_frame'),
      ...snapshot.filter((e) => e.kind === 'update_frame' || e.kind === 'update_thread'),
    ]
    for (const edit of ordered) {
      const result = await applyDiscardOne(edit)
      if (result.messageId && result.content && !result.deleted) {
        restored[result.messageId] = result.content
      }
    }
    setJustRestoredByMessage((prev) => ({ ...prev, ...restored }))
    setPendingEdits([])
    setFocusedEditId(null)
    setPreviewOriginal(false)
    onMessagesMutated?.()
    bumpMessages({
      contentUpdates: Object.entries(restored).map(([messageId, content]) => ({
        messageId,
        content,
      })),
    })
  }, [pendingEdits, applyDiscardOne, onMessagesMutated])

  const displayContentFor = useCallback(
    (messageId: string, liveContent: string) => {
      const edit = pendingEdits.find((e) => e.messageId === messageId)
      if (!edit) return liveContent
      // Eye on → original (empty for creates); eye off → proposed
      if (previewOriginal) {
        return edit.kind === 'create_frame' ? '<p></p>' : edit.originalContent
      }
      return edit.proposedContent || liveContent
    },
    [pendingEdits, previewOriginal]
  )

  const isFramePending = useCallback(
    (messageId: string) => pendingEdits.some((e) => e.messageId === messageId),
    [pendingEdits]
  )

  const isThreadPending = useCallback(
    (edgeId: string) => pendingEdits.some((e) => e.edgeId === edgeId),
    [pendingEdits]
  )

  const pendingForMessage = useCallback(
    (messageId: string) => pendingEdits.find((e) => e.messageId === messageId),
    [pendingEdits]
  )

  const value = useMemo<AiEditSessionValue>(
    () => ({
      pendingEdits,
      previewOriginal,
      showAiOrigin,
      hasAiContent,
      aiTopBarPinned,
      focusedEditId,
      justRestoredByMessage,
      setShowAiOrigin,
      setAiTopBarPinned,
      setPreviewOriginal,
      setFocusedEditId,
      consumeRestoredContent,
      addPendingEdits,
      saveEdit,
      discardEdit,
      saveAll,
      discardAll,
      displayContentFor,
      isFramePending,
      isThreadPending,
      pendingForMessage,
    }),
    [
      pendingEdits,
      previewOriginal,
      showAiOrigin,
      hasAiContent,
      aiTopBarPinned,
      focusedEditId,
      justRestoredByMessage,
      setShowAiOrigin,
      setAiTopBarPinned,
      consumeRestoredContent,
      addPendingEdits,
      saveEdit,
      discardEdit,
      saveAll,
      discardAll,
      displayContentFor,
      isFramePending,
      isThreadPending,
      pendingForMessage,
    ]
  )

  return (
    <AiEditSessionContext.Provider value={value}>{children}</AiEditSessionContext.Provider>
  )
}

export function useAiEditSession(): AiEditSessionValue {
  const ctx = useContext(AiEditSessionContext)
  if (!ctx) {
    return {
      pendingEdits: [],
      previewOriginal: false,
      showAiOrigin: false,
      hasAiContent: false,
      aiTopBarPinned: false,
      focusedEditId: null,
      justRestoredByMessage: {},
      setShowAiOrigin: () => {},
      setAiTopBarPinned: () => {},
      setPreviewOriginal: () => {},
      setFocusedEditId: () => {},
      consumeRestoredContent: () => {},
      addPendingEdits: () => {},
      saveEdit: async () => {},
      discardEdit: async () => {},
      saveAll: async () => {},
      discardAll: async () => {},
      displayContentFor: (_id, live) => live,
      isFramePending: () => false,
      isThreadPending: () => false,
      pendingForMessage: () => undefined,
    }
  }
  return ctx
}

export function buildFramePendingEdit(opts: {
  messageId: string
  originalContent?: string
  proposedHtml?: string
  contentHtml?: string
  replacements?: AiTextReplacement[]
  summary: string
  actionLogId?: string
  fillColor?: string
  borderColor?: string
  originalFillColor?: string
  originalBorderColor?: string
  colorChanged?: boolean
}): AiPendingEditInput {
  return {
    kind: 'update_frame',
    messageId: opts.messageId,
    summary: opts.summary,
    originalContent: opts.originalContent,
    proposedContent: opts.proposedHtml,
    contentHtml: opts.contentHtml,
    replacements: opts.replacements,
    actionLogId: opts.actionLogId,
    fillColor: opts.fillColor,
    borderColor: opts.borderColor,
    originalFillColor: opts.originalFillColor,
    originalBorderColor: opts.originalBorderColor,
    colorChanged: opts.colorChanged,
  }
}

export function buildCreateFramePendingEdit(opts: {
  messageId: string
  contentHtml: string
  summary: string
  actionLogId?: string
  fillColor?: string
  borderColor?: string
  colorChanged?: boolean
}): AiPendingEditInput {
  return {
    kind: 'create_frame',
    messageId: opts.messageId,
    summary: opts.summary,
    originalContent: '',
    proposedContent: opts.contentHtml,
    contentHtml: opts.contentHtml,
    actionLogId: opts.actionLogId,
    fillColor: opts.fillColor,
    borderColor: opts.borderColor,
    colorChanged: opts.colorChanged,
  }
}

export function buildCreateThreadPendingEdit(opts: {
  edgeId: string
  summary: string
  actionLogId?: string
  sourceFrameId?: string
  targetFrameId?: string
}): AiPendingEditInput {
  return {
    kind: 'create_thread',
    edgeId: opts.edgeId,
    sourceFrameId: opts.sourceFrameId,
    targetFrameId: opts.targetFrameId,
    summary: opts.summary,
    actionLogId: opts.actionLogId,
  }
}
