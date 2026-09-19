// Layer groups — local headers in the utility Layers list (per board). Membership only; z-order stays on the layers snapshot.
// `nodnotes-layer-stack` is the mixed order of those headers and loose layers (a header can sit between thumbs).

/** One named header. Members are RF node ids, exclusive across groups on that board. */
export type LayerGroup = {
  id: string // UUID
  boardId: string // conversations.id — node ids are not global
  name: string // Header label
  createdAt: string // ISO
  layerIds: string[] // Front-to-back under this header
  collapsed?: boolean // Closed folder hides members until the icon is clicked
}

const LAYER_GROUPS_KEY = 'nodnotes-layer-groups' // localStorage key
const LAYER_STACK_KEY = 'nodnotes-layer-stack' // boardId → mixed header / loose-layer order
const EMPTY: LayerGroup[] = [] // Stable SSR snapshot (useSyncExternalStore)
export const EMPTY_LAYER_STACK: string[] = [] // Stable empty stack (SSR and boards with no saved order)

type Listener = () => void
const listeners = new Set<Listener>()
let cache: LayerGroup[] | null = null // Stable client snapshot
let stackCache: Record<string, string[]> | null = null // boardId → tokens, stable until the next write

/** Stack token for a group header. */
export function groupStackToken(id: string): string {
  return `g:${id}` // Prefix so a header id cannot collide with a layer id
}

/** Stack token for a layer that is not under a header. */
export function layerStackToken(id: string): string {
  return `l:${id}`
}

/** Notify Layers list subscribers. */
function notify() {
  listeners.forEach((fn) => fn()) // Each hook re-reads the cache
}

/** Subscribe to group create / rename / membership changes. */
export function subscribeLayerGroups(fn: Listener): () => void {
  listeners.add(fn)
  return () => {
    listeners.delete(fn) // Drop on unmount
  }
}

/** All boards' groups. SSR and empty storage share one array. */
export function getLayerGroups(): LayerGroup[] {
  if (typeof window === 'undefined') return EMPTY // No localStorage on the server
  if (cache) return cache // Same reference until the next write
  try {
    const raw = localStorage.getItem(LAYER_GROUPS_KEY)
    const list = raw ? (JSON.parse(raw) as LayerGroup[]) : []
    cache = Array.isArray(list) ? list : EMPTY
  } catch {
    cache = EMPTY // Corrupt JSON → no headers
  }
  return cache
}

/** Persist and publish a new snapshot. */
function setLayerGroups(next: LayerGroup[]) {
  cache = next // Swap before notify so readers see the write
  try {
    localStorage.setItem(LAYER_GROUPS_KEY, JSON.stringify(next))
  } catch {
    /* Quota — keep the in-memory list for this session */
  }
  notify()
}

/** Saved mixed order for one board. Missing boards share the empty array. */
function readStacks(): Record<string, string[]> {
  if (stackCache) return stackCache // Same map until the next write
  if (typeof window === 'undefined') return {}
  try {
    const raw = localStorage.getItem(LAYER_STACK_KEY)
    const parsed = raw ? (JSON.parse(raw) as Record<string, string[]>) : {}
    stackCache = parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {}
  } catch {
    stackCache = {} // Corrupt JSON → headers fall back to newest-first, then loose rows
  }
  return stackCache
}

/** Persist one board's mixed order. `publish` false when the caller notifies via setLayerGroups. */
function writeStack(boardId: string, tokens: string[], publish: boolean) {
  stackCache = { ...readStacks(), [boardId]: tokens } // New array so the hook sees the write
  try {
    localStorage.setItem(LAYER_STACK_KEY, JSON.stringify(stackCache))
  } catch {
    /* Quota — keep the in-memory order for this session */
  }
  if (publish) notify()
}

/** Tokens for this board (`g:` header, `l:` loose layer). Empty until the first reorder or new header. */
export function getLayerStack(boardId: string): string[] {
  if (!boardId || typeof window === 'undefined') return EMPTY_LAYER_STACK
  return readStacks()[boardId] ?? EMPTY_LAYER_STACK
}

/** Replace this board's mixed order and notify the Layers list. */
export function setLayerStack(boardId: string, tokens: string[]): void {
  writeStack(boardId, tokens, true)
}

/** First free "Group" / "Group 2" name on this board. */
function nextGroupName(existing: LayerGroup[]): string {
  const used = new Set(existing.map((g) => g.name)) // Names already taken
  if (!used.has('Group')) return 'Group'
  let n = 2
  while (used.has(`Group ${n}`)) n += 1
  return `Group ${n}`
}

/** Empty header at the top of this board's Layers list. */
export function createLayerGroup(boardId: string): LayerGroup {
  const existing = getLayerGroups()
  const onBoard = existing.filter((g) => g.boardId === boardId) // Names are per board
  const group: LayerGroup = {
    id: crypto.randomUUID(),
    boardId,
    name: nextGroupName(onBoard),
    createdAt: new Date().toISOString(),
    layerIds: [], // Drop targets until a thumb is dragged in
  }
  const token = groupStackToken(group.id) // New header is the first slot
  const stored = getLayerStack(boardId)
  const nextTokens =
    stored.length === 0
      ? [token, ...onBoard.map((g) => groupStackToken(g.id))] // First save: keep older headers under the new one
      : [token, ...stored.filter((t) => t !== token)]
  writeStack(boardId, nextTokens, false) // setLayerGroups publishes both
  setLayerGroups([group, ...existing]) // Newest header first
  return group
}

/** Rename a header (blank → Untitled). */
export function renameLayerGroup(id: string, name: string): void {
  const trimmed = name.trim() || 'Untitled'
  setLayerGroups(getLayerGroups().map((g) => (g.id === id ? { ...g, name: trimmed } : g)))
}

/** Open or close a header. Closed hides its member thumbs. */
export function setLayerGroupCollapsed(id: string, collapsed: boolean): void {
  setLayerGroups(getLayerGroups().map((g) => (g.id === id ? { ...g, collapsed } : g)))
}
/** Remove a header. Its layers take that slot in the mixed list. */
export function deleteLayerGroup(id: string): void {
  const all = getLayerGroups()
  const group = all.find((g) => g.id === id)
  if (group) {
    const token = groupStackToken(id)
    const stored = getLayerStack(group.boardId)
    if (stored.length > 0) {
      const next = stored.flatMap((t) => (t === token ? group.layerIds.map(layerStackToken) : [t])) // Members stay where the header was
      writeStack(group.boardId, next, false)
    }
  }
  setLayerGroups(all.filter((g) => g.id !== id))
}

/** Replace one header's member order (reorder inside the group). */
export function setLayerGroupOrder(groupId: string, layerIds: string[]): void {
  setLayerGroups(getLayerGroups().map((g) => (g.id === groupId ? { ...g, layerIds } : g)))
}

/**
 * Move a layer under a header, or back to the loose list.
 * Membership is exclusive on this board. `groupId` null = ungrouped.
 * `index` is within the target header's stored ids (not the visible subset).
 */
export function moveLayerUnderGroup(
  layerId: string,
  groupId: string | null,
  index: number,
  boardId: string
): void {
  const stripped = getLayerGroups().map((g) => {
    if (g.boardId !== boardId) return g // Other boards keep their members
    return { ...g, layerIds: g.layerIds.filter((id) => id !== layerId) } // Leave every header on this board
  })
  const next = groupId
    ? stripped.map((g) => {
        if (g.id !== groupId) return g
        const ids = [...g.layerIds]
        const i = Math.max(0, Math.min(index, ids.length)) // Clamp into the header
        ids.splice(i, 0, layerId)
        return { ...g, layerIds: ids }
      })
    : stripped // Null target: already stripped, so the layer is loose
  if (groupId) {
    const stored = getLayerStack(boardId)
    if (stored.length > 0) {
      writeStack(
        boardId,
        stored.filter((t) => t !== layerStackToken(layerId)), // The thumb renders under the header, not as its own row
        false
      )
    }
  }
  setLayerGroups(next)
}
