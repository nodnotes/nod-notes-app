// Board Y.Doc shape: frame fragments, layout map, threads map, seed meta

import * as Y from 'yjs'
import { frameFragmentField } from '@/lib/collab/config'

/** Layout entry for one RF frame (message id key). */
export type CollabFrameLayout = {
  x: number
  y: number
  zIndex?: number
  width?: number
  height?: number
}

/**
 * Structural frame presence — create/delete sync for peers (content stays in XmlFragment / DB).
 * Enough to patch the messages react-query cache so panels rebuild without a full reload.
 */
export type CollabFrameRosterEntry = {
  id: string
  role: 'user' | 'assistant'
  content: string // Stub — TipTap CRDT owns live text; refetch hydrates HTML
  created_at: string
  metadata: Record<string, unknown>
}

/** Thread (panel_edges) entry synced over Yjs. */
export type CollabThread = {
  id: string
  source: string // message id
  target: string // message id
  sourceHandle?: string | null
  targetHandle?: string | null
  metadata?: Record<string, unknown> | null
}

/** Awareness payload each client publishes (board cursors + identity). */
export type CollabAwarenessUser = {
  id: string
  name: string
  color: string
  avatarEmoji?: string | null
  avatarUnified?: string | null
  cursor?: { x: number; y: number } | null // Flow coords
  selectedFrameIds?: string[]
}

/** Shared maps on the board Y.Doc. */
export function getFramesLayoutMap(doc: Y.Doc): Y.Map<CollabFrameLayout> {
  return doc.getMap('frames') // messageId → { x, y, … }
}

/** Frame create/delete roster (message stubs). */
export function getFrameRosterMap(doc: Y.Doc): Y.Map<CollabFrameRosterEntry> {
  return doc.getMap('roster') // messageId → stub row
}

export function getThreadsMap(doc: Y.Doc): Y.Map<CollabThread> {
  return doc.getMap('threads') // edge id → thread
}

export function getMetaMap(doc: Y.Doc): Y.Map<unknown> {
  return doc.getMap('meta') // seeded flag, etc.
}

/** XmlFragment TipTap Collaboration binds to. */
export function getFrameFragment(doc: Y.Doc, messageId: string): Y.XmlFragment {
  return doc.getXmlFragment(frameFragmentField(messageId))
}

/** True when the fragment has no collaborative content yet (safe to seed from HTML). */
export function isFragmentEmpty(fragment: Y.XmlFragment): boolean {
  return fragment.length === 0
}

/**
 * First client to win the seed lock marks the doc seeded.
 * Returns true if this client should seed from DB / local state.
 */
export function tryClaimSeed(doc: Y.Doc): boolean {
  const meta = getMetaMap(doc)
  if (meta.get('seeded') === true) return false
  doc.transact(() => {
    if (meta.get('seeded') === true) return
    meta.set('seeded', true)
    meta.set('seededAt', Date.now())
  })
  return meta.get('seeded') === true
}

/** Write frame positions into the shared layout map (local drag / seed). */
export function setFrameLayouts(
  doc: Y.Doc,
  layouts: Record<string, CollabFrameLayout>,
  origin?: string
): void {
  const map = getFramesLayoutMap(doc)
  doc.transact(() => {
    for (const [id, layout] of Object.entries(layouts)) {
      map.set(id, layout)
    }
  }, origin)
}

/**
 * Diff-sync the roster to match local messages (adds / updates / deletes).
 * No-op writes when entries are unchanged so remote echo doesn’t loop.
 */
export function syncFrameRoster(
  doc: Y.Doc,
  entries: CollabFrameRosterEntry[],
  origin?: string
): void {
  const map = getFrameRosterMap(doc)
  const nextIds = new Set(entries.map((e) => e.id))
  doc.transact(() => {
    map.forEach((_value, key) => {
      if (!nextIds.has(key)) map.delete(key)
    })
    for (const entry of entries) {
      const prev = map.get(entry.id)
      if (
        prev &&
        prev.id === entry.id &&
        prev.role === entry.role &&
        prev.created_at === entry.created_at &&
        JSON.stringify(prev.metadata ?? {}) === JSON.stringify(entry.metadata ?? {})
      ) {
        continue // Unchanged — skip Y update
      }
      map.set(entry.id, entry)
    }
  }, origin)
}

/** Snapshot all roster entries. */
export function readAllRoster(doc: Y.Doc): CollabFrameRosterEntry[] {
  const map = getFrameRosterMap(doc)
  const out: CollabFrameRosterEntry[] = []
  map.forEach((value) => {
    out.push(value)
  })
  return out
}

/** Upsert / delete threads in the shared map. */
export function setThreads(
  doc: Y.Doc,
  threads: CollabThread[],
  removeIds?: string[],
  origin?: string
): void {
  const map = getThreadsMap(doc)
  doc.transact(() => {
    for (const id of removeIds ?? []) map.delete(id)
    for (const t of threads) map.set(t.id, t)
  }, origin)
}

/** Snapshot all layout entries. */
export function readAllFrameLayouts(doc: Y.Doc): Record<string, CollabFrameLayout> {
  const map = getFramesLayoutMap(doc)
  const out: Record<string, CollabFrameLayout> = {}
  map.forEach((value, key) => {
    out[key] = value
  })
  return out
}

/** Snapshot all threads. */
export function readAllThreads(doc: Y.Doc): CollabThread[] {
  const map = getThreadsMap(doc)
  const out: CollabThread[] = []
  map.forEach((value) => {
    out.push(value)
  })
  return out
}
