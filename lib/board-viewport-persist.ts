// Pan/zoom for one board, kept only for a reload of that same URL.
// Changing boards and sign-in still fit contents — those are not document reloads.

const STORAGE_PREFIX = 'nodnotes-board-viewport-' // sessionStorage; tab-scoped, survives reload

export type BoardViewport = {
  x: number // Pane translate X
  y: number // Pane translate Y
  zoom: number // Camera scale
  rotation?: number // Heading in degrees — paired with this pan so reload doesn’t orbit twice
}

// Board id that was in the address bar when this document reloaded.
// Undefined until the first client read so SSR never caches "no reload".
let reloadBoardId: string | null | undefined

// True until the user leaves the reloaded board. Coming back should fit, not restore.
let reloadRestoreArmed = true

// Set once the reloaded board has mounted, so a later /board (no id) also disarms restore.
let sawReloadTarget = false

/** Board id to restore, or null when this document was not a reload of /board/{id}. */
export function reloadedBoardId(): string | null {
  if (reloadBoardId !== undefined) return reloadBoardId // Later navigations keep the original reload target
  if (typeof window === 'undefined') return null // SSR has no navigation timing; do not cache
  const nav = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined // This document's load
  const reloaded = nav?.type === 'reload' // Cmd+R / refresh — not a link, redirect, or sign-in assign
  const match = reloaded ? window.location.pathname.match(/^\/board\/([^/]+)\/?$/) : null // Only an exact board URL
  reloadBoardId = match?.[1] ?? null // Null: sign-in, board switch, or /board with no id
  return reloadBoardId // Callers compare this to the mounted board
}

/** Last camera for this board in this tab, or null when missing or corrupt. */
export function readBoardViewport(boardId: string): BoardViewport | null {
  if (typeof window === 'undefined' || !boardId) return null // SSR / empty id
  try {
    const raw = window.sessionStorage.getItem(STORAGE_PREFIX + boardId) // Per-board blob
    if (!raw) return null // Never panned here in this tab
    const parsed = JSON.parse(raw) as Partial<BoardViewport> // Stored {x,y,zoom}
    if (
      typeof parsed.x !== 'number' ||
      typeof parsed.y !== 'number' ||
      typeof parsed.zoom !== 'number' ||
      !Number.isFinite(parsed.x) ||
      !Number.isFinite(parsed.y) ||
      !Number.isFinite(parsed.zoom) ||
      parsed.zoom <= 0
    ) {
      return null // Bad payload must not move the camera
    }
    const rotation =
      typeof parsed.rotation === 'number' && Number.isFinite(parsed.rotation) ? parsed.rotation : undefined // Heading saved with this pan
    return { x: parsed.x, y: parsed.y, zoom: parsed.zoom, rotation } // Safe to pass to setViewport
  } catch {
    return null // Private mode / bad JSON
  }
}

/** Remember the camera so the next reload of this board can put it back. */
export function writeBoardViewport(boardId: string, viewport: BoardViewport): void {
  if (typeof window === 'undefined' || !boardId) return // SSR / missing id
  if (
    !Number.isFinite(viewport.x) ||
    !Number.isFinite(viewport.y) ||
    !Number.isFinite(viewport.zoom) ||
    viewport.zoom <= 0
  ) {
    return // Never persist NaN — a later reload would skip fit and show a blank pane
  }
  try {
    const rotation =
      typeof viewport.rotation === 'number' && Number.isFinite(viewport.rotation) ? viewport.rotation : undefined // Omit when unknown
    window.sessionStorage.setItem(
      STORAGE_PREFIX + boardId,
      JSON.stringify({ x: viewport.x, y: viewport.y, zoom: viewport.zoom, rotation }) // Pan + heading, one camera
    )
  } catch {
    // Quota / private mode — reload will fit contents instead
  }
}

/** Drop every saved camera. Account switch reloads the same URL and must fit, not restore. */
export function clearStoredBoardViewports(): void {
  if (typeof window === 'undefined') return // SSR
  try {
    const keys: string[] = [] // Collect first — removing while iterating skips entries
    for (let i = 0; i < window.sessionStorage.length; i++) {
      const key = window.sessionStorage.key(i) // Index stays valid until we delete
      if (key && key.startsWith(STORAGE_PREFIX)) keys.push(key) // Only our cameras
    }
    for (const key of keys) window.sessionStorage.removeItem(key) // Next reload has nothing to restore
  } catch {
    // Private mode
  }
}

/** Camera to apply on this mount, or null so init fitView still frames the contents. */
export function viewportToRestore(boardId: string | undefined, embedded: boolean): BoardViewport | null {
  if (embedded) return null // Nested previews must not consume the host board's reload
  const target = reloadedBoardId() // Null unless this document was a reload of /board/{id}
  if (!target || !reloadRestoreArmed) return null // Sign-in, or the user already left that board
  if (!boardId) {
    if (sawReloadTarget) reloadRestoreArmed = false // Moved to unsaved /board — next open fits
    return null // Id not ready, or this page has no board yet
  }
  if (boardId !== target) {
    reloadRestoreArmed = false // Changing boards fits, including a later return to the reloaded one
    return null
  }
  sawReloadTarget = true // This mount is the reload we are allowed to restore
  return readBoardViewport(boardId) // Null when this tab has no camera yet — caller fits
}
