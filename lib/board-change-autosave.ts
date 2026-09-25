// Google Docs-style history: dirty on board writes, flush after idle / heartbeat / hide.

import { isEphemeralSandboxId } from '@/lib/ephemeral-sandbox' // Previews never write history
import { autosaveBoardChange } from '@/lib/board-changes'
import { useEffect } from 'react' // Bind the open board

const IDLE_MS = 45_000 // Pause after the last edit, then snapshot
const HEARTBEAT_MS = 5 * 60_000 // Long typing session still gets a mid-session write

type AutosaveState = {
  boardId: string | null // Open live board (not an embed sandbox)
  dirty: boolean // Edits since the last successful flush
  flushing: boolean // One write at a time
  idleTimer: ReturnType<typeof setTimeout> | null
  heartbeatTimer: ReturnType<typeof setTimeout> | null
}

const state: AutosaveState = {
  boardId: null,
  dirty: false,
  flushing: false,
  idleTimer: null,
  heartbeatTimer: null,
}

/** Clear pending timers (board switch / unmount). */
function clearTimers(): void {
  if (state.idleTimer) clearTimeout(state.idleTimer)
  if (state.heartbeatTimer) clearTimeout(state.heartbeatTimer)
  state.idleTimer = null
  state.heartbeatTimer = null
}

/** Which live board receives dirty marks from persist writes. */
export function setAutosaveBoardId(boardId: string | null): void {
  const next = boardId && !isEphemeralSandboxId(boardId) ? boardId : null // Sandboxes stay out
  if (state.boardId === next) return
  clearTimers()
  state.boardId = next
  state.dirty = false // Don't flush the previous board onto this one
}

/** Mark the open board dirty (called after a durable board write). */
export function noteActiveBoardEdited(): void {
  const boardId = state.boardId
  if (!boardId) return // No live board
  state.dirty = true
  if (state.idleTimer) clearTimeout(state.idleTimer)
  state.idleTimer = setTimeout(() => {
    state.idleTimer = null
    void flushAutosave() // User paused
  }, IDLE_MS)
  if (!state.heartbeatTimer) {
    state.heartbeatTimer = setTimeout(() => {
      state.heartbeatTimer = null
      void flushAutosave() // Still editing after 5 minutes
    }, HEARTBEAT_MS)
  }
}

/** Write a session version if the board is dirty. */
export async function flushAutosave(): Promise<void> {
  const boardId = state.boardId
  if (!boardId || !state.dirty || state.flushing) return // Nothing to do / already writing
  if (isEphemeralSandboxId(boardId)) return
  state.dirty = false // New edits during the write re-arm via noteActiveBoardEdited
  clearTimers()
  state.flushing = true
  const visible = typeof document === 'undefined' || document.visibilityState === 'visible'
  try {
    const row = await autosaveBoardChange({
      conversationId: boardId,
      withPreview: visible, // Hidden tab JPEG is often blank
    })
    if (row && typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('nodnotes-board-change-saved')) // Changes list refresh
    }
  } catch (err) {
    console.error('Board autosave failed', err) // Stay quiet in the UI
    state.dirty = true // Try again on the next idle
  } finally {
    state.flushing = false
  }
}

/** Bind autosave to the open board — hide flushes; unmount clears. */
export function useBoardChangeAutosave(conversationId?: string): void {
  useEffect(() => {
    setAutosaveBoardId(conversationId ?? null) // Live board only
    return () => {
      setAutosaveBoardId(null) // Leave this board
    }
  }, [conversationId])

  useEffect(() => {
    const onHide = () => {
      if (document.visibilityState === 'hidden') void flushAutosave() // Leaving the tab
    }
    document.addEventListener('visibilitychange', onHide)
    return () => document.removeEventListener('visibilitychange', onHide)
  }, [])
}
