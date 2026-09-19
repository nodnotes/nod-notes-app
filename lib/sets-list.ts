// Named sets — created from the frame menu's Add to set picker, listed in the Sets utility tab.
// Membership is in-memory + localStorage. Selecting a set glows its frames on the board.

/** What was added. New rows are frames only; block and text remain so older rows still load. */
export type SetItemKind = 'frame' | 'block' | 'text'

/** One named set in the picker and the utility list. */
export type NodSet = {
  id: string // Stable id
  name: string // "Set 1", "Set 2", …
  collapsed?: boolean // Closed hides member thumbs until the name is clicked
}

/** One piece of content inside a set. */
export type SetMember = {
  id: string // Row id
  setId: string // Parent set
  kind: SetItemKind // Frame, block, or text
  label: string // Shown under the set name
  nodeId?: string // RF node id or chat turn id — frame glow host
}

const STORAGE_KEY = 'nodnotes-sets-v1' // Survives reload; not a Supabase table
const REVEAL_EVENT = 'nodnotes-reveal-sets' // Sidebar opens the Sets tab
const EMPTY_SETS: NodSet[] = [] // Stable server snapshot
const EMPTY_MEMBERS: SetMember[] = [] // Stable server snapshot

type Listener = () => void
const listeners = new Set<Listener>()
let sets: NodSet[] = [] // Creation order
let members: SetMember[] = [] // Newest first
let selectedSetId: string | null = null // Utility row whose members glow on the board; not persisted

type Stored = { sets: NodSet[]; members: SetMember[] }

function load() {
  if (typeof window === 'undefined') return // SSR has no storage
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return
    const parsed = JSON.parse(raw) as Stored
    if (Array.isArray(parsed.sets)) sets = parsed.sets.filter((s) => s && s.id && s.name)
    if (Array.isArray(parsed.members)) {
      members = parsed.members.filter((m) => m && m.id && m.setId && m.kind)
    }
  } catch {
    /* Corrupt storage — start empty */
  }
}

load() // Hydrate once on the client module

function persist() {
  if (typeof window === 'undefined') return
  try {
    const payload: Stored = { sets, members }
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload))
  } catch {
    /* Quota / private mode */
  }
}

function notify() {
  listeners.forEach((fn) => fn()) // useSyncExternalStore subscribers
  highlightSelectedSet() // Board glow follows the selected set, including after a new member
}

/** Subscribe for useSyncExternalStore. */
export function subscribeSets(fn: Listener): () => void {
  listeners.add(fn)
  return () => {
    listeners.delete(fn)
  }
}

/** Named sets, oldest first (stable array until the next write). */
export function getSets(): NodSet[] {
  return sets.length ? sets : EMPTY_SETS
}

/** Members, newest first (stable array until the next write). */
export function getSetMembers(): SetMember[] {
  return members.length ? members : EMPTY_MEMBERS
}

/** Set whose content is glowing on the board, or null. */
export function getSelectedSetId(): string | null {
  return selectedSetId // Primitive snapshot — stable until the next select
}

/** Toggle the utility-list selection. The same id again clears the board glow. */
export function selectSet(id: string) {
  selectedSetId = selectedSetId === id ? null : id // One set at a time
  notify() // List row + board halo
}

/** Open the utility sidebar on Sets. */
export function requestRevealSets() {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent(REVEAL_EVENT))
}

/** Event name the sidebar context listens for. */
export const SETS_REVEAL_EVENT = REVEAL_EVENT

/** Short label for a menu row / search. */
export function clipSetLabel(raw: string, fallback: string): string {
  const text = raw.replace(/\s+/g, ' ').trim() // Collapse whitespace
  if (!text) return fallback
  return text.length > 48 ? `${text.slice(0, 48)}…` : text
}

/** Label for an RF node added from the frame menu. */
export function labelForFlowNode(node: { type?: string; data?: unknown }): string {
  if (node.type === 'freehand') return 'Drawing' // No text body
  if (node.type === 'shape') return 'Shape'
  const data = node.data as
    | { promptMessage?: { content?: string; metadata?: Record<string, unknown> } }
    | undefined
  const meta = data?.promptMessage?.metadata
  const title = typeof meta?.blockTitle === 'string' ? meta.blockTitle.trim() : ''
  if (title) return clipSetLabel(title, 'Frame')
  const html = data?.promptMessage?.content || ''
  const plain = html.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/gi, ' ')
  return clipSetLabel(plain, 'Frame')
}

function nextId(): string {
  return typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : `set-${Date.now()}`
}

/** Rename a set. A blank name keeps the generated "Set N". */
export function renameSet(id: string, raw: string) {
  const name = raw.replace(/\s+/g, ' ').trim() // Collapse whitespace
  if (!name) return // Empty commit keeps the generated name
  let changed = false
  const next = sets.map((s) => {
    if (s.id !== id || s.name === name) return s // Not this set, or already that name
    changed = true
    return { ...s, name }
  })
  if (!changed) return
  sets = next // New array so the store snapshot changes
  persist()
  notify()
}

/** Open or close a set. Closed hides its thumbs. */
export function setSetCollapsed(id: string, collapsed: boolean) {
  let changed = false
  const next = sets.map((s) => {
    if (s.id !== id || !!s.collapsed === collapsed) return s // Not this set, or already that state
    changed = true
    return { ...s, collapsed }
  })
  if (!changed) return
  sets = next
  persist()
  notify()
}

/** Create "Set N" and return it. Does not add content. The picker names it before the frame is stored. */
export function createSet(): NodSet {
  const used = new Set(sets.map((s) => s.name)) // Avoid "Set 1" twice after a delete-less rename collision
  let n = sets.length + 1
  let name = `Set ${n}`
  while (used.has(name)) {
    n += 1
    name = `Set ${n}`
  }
  const set: NodSet = { id: nextId(), name }
  sets = [...sets, set] // New array so the store snapshot changes
  persist()
  notify()
  return set
}

/** Remove a set and its members. Clears the board glow if that set was selected. */
export function deleteSet(id: string) {
  const nextSets = sets.filter((s) => s.id !== id) // Drop the named set
  if (nextSets.length === sets.length) return // Unknown id
  sets = nextSets
  members = members.filter((m) => m.setId !== id) // Membership goes with the set
  if (selectedSetId === id) selectedSetId = null // Don't glow a deleted set
  persist()
  notify()
  stampFramesInSets() // Drop data-in-set on frames that were only in this set
}

/** Put a frame in a set. Blocks and text are not members. Skips an identical row. Opens the Sets tab. */
export function addMember(
  setId: string,
  partial: { kind: SetItemKind; label: string; nodeId?: string }
): void {
  if (partial.kind !== 'frame' || !partial.nodeId) return // Frame menu only — need a board or chat frame id
  const dup = members.some(
    (m) =>
      m.setId === setId &&
      m.kind === partial.kind &&
      m.label === partial.label &&
      m.nodeId === partial.nodeId
  )
  if (!dup) {
    members = [{ ...partial, id: nextId(), setId }, ...members]
    persist()
    notify()
  }
  if (partial.kind === 'frame' && partial.nodeId) stampFrame(partial.nodeId) // Glow host, even on a duplicate add
  requestRevealSets()
}

/** RF node ids (and chat turn ids) whose whole frame is in some set. */
export function frameIdsInSets(): string[] {
  const ids: string[] = []
  for (const m of members) {
    if (m.kind === 'frame' && m.nodeId && !ids.includes(m.nodeId)) ids.push(m.nodeId)
  }
  return ids
}

/** Mark a live frame so the selected-frame glow CSS can see it. */
export function stampFrame(nodeId: string) {
  if (typeof document === 'undefined') return
  const safe = CSS.escape(nodeId)
  const panel = document.querySelector(
    `.react-flow__node[data-id="${safe}"] [data-panel-container="true"]`
  )
  const turn = document.querySelector(`[data-ai-turn="${safe}"]`)
  if (panel instanceof HTMLElement) panel.setAttribute('data-in-set', 'frame') // Board frame fill
  if (turn instanceof HTMLElement) turn.setAttribute('data-in-set', 'frame') // Chat frame
}

/** Re-apply frame stamps after nodes mount. Drops stamps for frames no longer in a set. */
export function stampFramesInSets() {
  if (typeof document === 'undefined') return
  const ids = new Set(frameIdsInSets())
  document.querySelectorAll<HTMLElement>('[data-in-set="frame"]').forEach((el) => {
    const id =
      el.closest('.react-flow__node')?.getAttribute('data-id') ||
      el.getAttribute('data-ai-turn') ||
      ''
    if (!ids.has(id)) el.removeAttribute('data-in-set')
  })
  ids.forEach((id) => stampFrame(id))
  highlightSelectedSet() // Remounts drop the live halo attribute
}

/** Paint the blue halo on every frame in the selected set. Clears it when nothing is selected. */
export function highlightSelectedSet() {
  if (typeof document === 'undefined') return // SSR
  const want = new Set<HTMLElement>() // Elements that should keep the halo — skip no-op writes so the observer does not loop
  if (selectedSetId) {
    const id = selectedSetId
    for (const m of members) {
      if (m.setId !== id || m.kind !== 'frame' || !m.nodeId) continue // Only frames glow
      const safe = m.nodeId.replace(/\\/g, '\\\\').replace(/"/g, '\\"') // RF id inside quotes
      const node = document.querySelector(`.react-flow__node[data-id="${safe}"]`) // Board frame
      const panel = node?.querySelector('[data-panel-container="true"]') // Frame box; shapes may not have one
      const host = panel instanceof HTMLElement ? panel : node // Glow the box, else the whole node
      if (host instanceof HTMLElement) want.add(host)
    }
  }
  document.querySelectorAll<HTMLElement>('[data-set-highlight]').forEach((el) => {
    if (!want.has(el)) el.removeAttribute('data-set-highlight') // Left the set, or selection cleared
  })
  want.forEach((el) => {
    if (!el.hasAttribute('data-set-highlight')) el.setAttribute('data-set-highlight', '') // Halo without selecting the frame
  })
}
