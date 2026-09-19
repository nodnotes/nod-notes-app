// Layer groups — local headers in the utility Layers list (per board). Membership only; z-order stays on the layers snapshot.

/** One named header. Members are RF node ids, exclusive across groups on that board. */
export type LayerGroup = {
  id: string // UUID
  boardId: string // conversations.id — node ids are not global
  name: string // Header label
  createdAt: string // ISO
  layerIds: string[] // Front-to-back under this header
}

const LAYER_GROUPS_KEY = 'nodnotes-layer-groups' // localStorage key
const EMPTY: LayerGroup[] = [] // Stable SSR snapshot (useSyncExternalStore)

type Listener = () => void
const listeners = new Set<Listener>()
let cache: LayerGroup[] | null = null // Stable client snapshot

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
  setLayerGroups([group, ...existing]) // Newest header first
  return group
}

/** Rename a header (blank → Untitled). */
export function renameLayerGroup(id: string, name: string): void {
  const trimmed = name.trim() || 'Untitled'
  setLayerGroups(getLayerGroups().map((g) => (g.id === id ? { ...g, name: trimmed } : g)))
}

/** Remove a header. Its layers return to the loose list. */
export function deleteLayerGroup(id: string): void {
  setLayerGroups(getLayerGroups().filter((g) => g.id !== id))
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
  setLayerGroups(next)
}
