// Canvas-node erase tombstones — stop late inserts / query merges / retries from resurrecting ink
import type { QueryClient } from '@tanstack/react-query'

const ERASED_KEY = 'nodnotes-erased-canvas-nodes' // sessionStorage id list
const ERASED_MAX = 300 // Cap so a long session cannot balloon the key

/** In-memory tombstones for this tab (sessionStorage can lag or fail in private mode). */
const erasedMemory = new Set<string>()

/** Read erased canvas node ids for this tab session. */
function readErasedIds(): Set<string> {
  const ids = new Set(erasedMemory)
  try {
    const raw = sessionStorage.getItem(ERASED_KEY)
    if (!raw) return ids
    const list = JSON.parse(raw) as unknown
    if (!Array.isArray(list)) return ids
    for (const id of list) {
      if (typeof id === 'string') ids.add(id)
    }
  } catch {
    // keep memory set
  }
  return ids
}

/** Persist erased ids (newest kept when over cap). */
function writeErasedIds(ids: Set<string>) {
  erasedMemory.clear()
  for (const id of ids) erasedMemory.add(id)
  try {
    const list = [...ids]
    const trimmed = list.length > ERASED_MAX ? list.slice(list.length - ERASED_MAX) : list
    sessionStorage.setItem(ERASED_KEY, JSON.stringify(trimmed))
  } catch {
    // Private mode / quota — memory set still blocks merges this session
  }
}

/** True when this id was erased and must not be re-inserted by retries or late saves. */
export function isCanvasNodeErased(id: string): boolean {
  if (erasedMemory.has(id)) return true
  return readErasedIds().has(id)
}

/**
 * Mark canvas nodes as intentionally erased.
 * Clears failed-save retries so reload cannot resurrect them.
 */
export function markCanvasNodesErased(ids: string[]) {
  if (ids.length === 0) return
  const erased = readErasedIds()
  for (const id of ids) {
    erased.add(id)
    erasedMemory.add(id)
    removeFailedSave(id) // Drop localStorage retry payloads for this ink
  }
  writeErasedIds(erased)
}

/** Allow undo / explicit recreate to insert this id again. */
export function clearCanvasNodeErased(ids: string[]) {
  if (ids.length === 0) return
  const erased = readErasedIds()
  let changed = false
  for (const id of ids) {
    if (erased.delete(id)) changed = true
    erasedMemory.delete(id)
  }
  if (changed) writeErasedIds(erased)
}

/** Drop erased ids from the React Query canvas-nodes cache so the load effect cannot re-add them live. */
export function removeCanvasNodesFromQueryCache(
  queryClient: QueryClient,
  conversationId: string,
  ids: string[],
) {
  if (!conversationId || ids.length === 0) return
  const idSet = new Set(ids)
  queryClient.setQueryData(
    ['canvas-nodes', conversationId],
    (old: Array<{ id: string }> | undefined) => {
      if (!old || old.length === 0) return old
      return old.filter((row) => !idSet.has(row.id))
    },
  )
}

/** Patch one freehand row’s `data` in the query cache (spot erase holes) without a refetch merge. */
export function patchCanvasNodeDataInQueryCache(
  queryClient: QueryClient,
  conversationId: string,
  id: string,
  data: unknown,
) {
  if (!conversationId || !id) return
  queryClient.setQueryData(
    ['canvas-nodes', conversationId],
    (old: Array<{ id: string; data?: unknown }> | undefined) => {
      if (!old || old.length === 0) return old
      return old.map((row) => (row.id === id ? { ...row, data } : row))
    },
  )
}

/** Insert or replace a canvas node row in the React Query cache (split-off pieces). */
export function putCanvasNodeInQueryCache(
  queryClient: QueryClient,
  conversationId: string,
  row: {
    id: string
    node_type: string
    position_x: number
    position_y: number
    width: number
    height: number
    data: unknown
  },
) {
  if (!conversationId || !row.id) return
  queryClient.setQueryData(
    ['canvas-nodes', conversationId],
    (old: Array<Record<string, unknown>> | undefined) => {
      const list = old ? [...old] : []
      const i = list.findIndex((r) => r.id === row.id)
      if (i >= 0) list[i] = { ...list[i], ...row }
      else list.push(row)
      return list
    },
  )
}

/** Remove a node from every conversation’s failed-save retry list. */
export function removeFailedSave(nodeId: string) {
  try {
    const keys = Object.keys(localStorage).filter((key) =>
      key.startsWith('nodnotes-failed-canvas-saves-'),
    )
    for (const key of keys) {
      const failed = JSON.parse(localStorage.getItem(key) || '[]') as Array<{ node?: { id?: string } }>
      const filtered = failed.filter((item) => item?.node?.id !== nodeId)
      if (filtered.length !== failed.length) {
        if (filtered.length === 0) localStorage.removeItem(key)
        else localStorage.setItem(key, JSON.stringify(filtered))
      }
    }
  } catch (error) {
    console.error('🎨 Error removing failed save:', error)
  }
}
