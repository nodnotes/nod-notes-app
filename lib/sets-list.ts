// Named sets — created from the Add to set picker, listed in the Sets utility tab.
// Membership is in-memory + localStorage. The live glow is a TipTap mark / data-in-set stamp.

/** What was added. Frame = board or chat frame; block = TipTap line; text = a selection. */
export type SetItemKind = 'frame' | 'block' | 'text'

/** One named set in the picker and the utility list. */
export type NodSet = {
  id: string // Stable id
  name: string // "Set 1", "Set 2", …
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

/** Create "Set N" and return it. Does not add content. */
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

/** Put content in a set. Skips an identical row. Opens the Sets tab. */
export function addMember(
  setId: string,
  partial: { kind: SetItemKind; label: string; nodeId?: string }
): void {
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
}
