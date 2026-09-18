// Active table Sort target for the Actions-bar Sort strip.
// Sort is table-only: freeform frames stay Filter-only (no spatial reorder).
// Targets register when a databaseBlock mounts (selected or not); selection wins.

import type { NotionDbProperty } from '@/lib/notion/database' // Column schema for property pickers
import type { DatabaseSort } from '@/lib/notion/database-view' // NodNotes view sorts
import { useSyncExternalStore } from 'react' // Subscribe from toolbar / strip

/** One mounted Notion table that can own Actions Sort. */
export type BoardTableSortTarget = {
  instanceId: string // Stable id (messageId:databaseId) for register/unregister
  notionDatabaseId: string // Notion DB id for cache lookups
  properties: NotionDbProperty[] // Columns available to sort by
  sorts: DatabaseSort[] // Current viewSettings.sorts
  setSorts: (sorts: DatabaseSort[]) => void // Persist into databaseBlock viewSettings
  selected: boolean // Host frame RF-selected — beats ambient tables
}

const claimants = new Map<string, BoardTableSortTarget>() // All mounted tables
let resolved: BoardTableSortTarget | null = null // Winning Actions Sort target
const listeners = new Set<() => void>() // useSyncExternalStore subscribers

function notify(): void {
  listeners.forEach((l) => l()) // Push a new snapshot to every subscriber
}

/** Prefer a selected table; else the sole mounted table; else first mounted. */
function resolveTarget(): BoardTableSortTarget | null {
  if (claimants.size === 0) return null
  let selected: BoardTableSortTarget | null = null
  let first: BoardTableSortTarget | null = null
  for (const c of claimants.values()) {
    if (!first) first = c
    if (c.selected) {
      selected = c // Last selected wins if multi-select somehow dual-registers
    }
  }
  if (selected) return selected
  if (claimants.size === 1) return first
  return first // Universal: still allow Sort with a default table when none selected
}

function publishResolved(): void {
  const next = resolveTarget()
  const prev = resolved
  if (
    prev &&
    next &&
    prev.instanceId === next.instanceId &&
    prev.notionDatabaseId === next.notionDatabaseId &&
    prev.properties === next.properties &&
    prev.sorts === next.sorts &&
    prev.setSorts === next.setSorts &&
    prev.selected === next.selected
  ) {
    return // Identical — keep cached ref
  }
  if (!prev && !next) return
  resolved = next
  notify()
}

/** Subscribe to Sort-target changes (mount/unmount or sorts rewrite). */
export function subscribeBoardTableSortTarget(cb: () => void): () => void {
  listeners.add(cb)
  return () => {
    listeners.delete(cb)
  }
}

/** Cached resolved target — same ref until publish. */
export function getBoardTableSortTarget(): BoardTableSortTarget | null {
  return resolved
}

/** True when at least one table has registered (mounted databaseBlock). */
export function canBoardTableSort(): boolean {
  return resolved !== null
}

/**
 * Mounted databaseBlock claims Actions Sort (selected or ambient).
 * Selected claimants win over ambient; sole ambient table still enables Sort.
 */
export function registerBoardTableSortTarget(next: BoardTableSortTarget): void {
  const prev = claimants.get(next.instanceId)
  if (
    prev &&
    prev.notionDatabaseId === next.notionDatabaseId &&
    prev.properties === next.properties &&
    prev.sorts === next.sorts &&
    prev.setSorts === next.setSorts &&
    prev.selected === next.selected
  ) {
    return // No change for this instance
  }
  claimants.set(next.instanceId, next)
  publishResolved()
}

/** Drop a claimant when its NodeView unmounts (or frame leaves the board). */
export function unregisterBoardTableSortTarget(instanceId: string): void {
  if (!claimants.has(instanceId)) return
  claimants.delete(instanceId)
  publishResolved()
}

/** Hook: live Sort target for the Actions strip / triggers. */
export function useBoardTableSortTarget(): BoardTableSortTarget | null {
  return useSyncExternalStore(
    subscribeBoardTableSortTarget,
    getBoardTableSortTarget,
    () => null // SSR: no table target
  )
}

/** True when frame HTML embeds a TipTap databaseBlock (table). */
export function contentHasDatabaseBlock(content: string | null | undefined): boolean {
  if (!content) return false
  return /data-type=["']databaseBlock["']/i.test(content)
}

/** Count frames on the board whose content embeds a table. */
export function countBoardTables(nodes: Array<{ selected?: boolean; data?: unknown; type?: string }>): {
  total: number
  selected: number
} {
  let total = 0
  let selected = 0
  for (const node of nodes) {
    if (node.type && node.type !== 'chatPanel') continue
    const data = node.data as
      | { promptMessage?: { content?: string; metadata?: Record<string, unknown> } }
      | undefined
    const meta = data?.promptMessage?.metadata || {}
    if (meta.isBlock !== true) continue
    if (!contentHasDatabaseBlock(data?.promptMessage?.content)) continue
    total += 1
    if (node.selected) selected += 1
  }
  return { total, selected }
}
