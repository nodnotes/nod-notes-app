// Ephemeral Notion sync notices for the top-bar check (and future apply UI).

export type NotionSyncNoticeVariant = 'progress' | 'success' | 'info' | 'error'

export type NotionSyncNotice = {
  id: number // Monotonic id so React remounts fresh toasts
  message: string // Short status line
  variant: NotionSyncNoticeVariant // Visual treatment
}

let notice: NotionSyncNotice | null = null // Current toast (single slot)
let noticeId = 0 // Increment per show
let clearTimer: ReturnType<typeof setTimeout> | null = null // Auto-dismiss
const listeners = new Set<() => void>() // useSyncExternalStore subscribers

function emit() {
  for (const fn of listeners) fn() // Notify React hosts
}

/** Subscribe to notice changes (for the floating toast host). */
export function subscribeNotionSyncNotice(onStoreChange: () => void): () => void {
  listeners.add(onStoreChange)
  return () => {
    listeners.delete(onStoreChange)
  }
}

/** Snapshot for useSyncExternalStore. */
export function getNotionSyncNotice(): NotionSyncNotice | null {
  return notice
}

/** Show (or replace) the sync toast. Progress stays until replaced; others auto-clear. */
export function showNotionSyncNotice(
  message: string,
  variant: NotionSyncNoticeVariant,
  opts?: { durationMs?: number }
): void {
  if (clearTimer) {
    clearTimeout(clearTimer) // Cancel prior auto-dismiss
    clearTimer = null
  }
  noticeId += 1
  notice = { id: noticeId, message, variant }
  emit()
  const duration =
    opts?.durationMs ??
    (variant === 'progress' ? 0 : variant === 'error' ? 4200 : 2600) // Progress sticky
  if (duration > 0) {
    clearTimer = setTimeout(() => {
      clearNotionSyncNotice(noticeId) // Only clear this generation
    }, duration)
  }
}

/** Clear the current notice (optionally only if it still matches id). */
export function clearNotionSyncNotice(expectedId?: number): void {
  if (expectedId != null && notice?.id !== expectedId) return // Stale clear
  if (clearTimer) {
    clearTimeout(clearTimer)
    clearTimer = null
  }
  notice = null
  emit()
}
