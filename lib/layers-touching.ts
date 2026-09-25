// Layers panel — items spatially touching the selected frame / drawing / thread

import type { Edge, Node } from 'reactflow'

/** One row in the utility Layers list. */
export type LayersTouchingItem = {
  id: string // RF node id
  kind: 'frame' | 'freehand' | 'shape' // Layerable board object
  label: string // Short title for the row
  zIndex: number // Sort key — higher = above
  selected: boolean // Currently in the RF selection
  previewUrl?: string // JPEG data URL of that node’s DOM
}

type LayersTouchingSnapshot = {
  items: LayersTouchingItem[] // Cluster sorted top→bottom
  seedKey: string // Selection signature — skip redundant republish
}

const TOUCH_PAD = 12 // Flow px — matches edge-snap stack gap so snapped frames count as touching

type Listener = () => void
const listeners = new Set<Listener>()
let snapshot: LayersTouchingSnapshot = { items: [], seedKey: '' }

/** Subscribe to layers-list updates (utility sidebar). */
export function subscribeLayersTouching(fn: Listener): () => void {
  listeners.add(fn)
  return () => {
    listeners.delete(fn)
  }
}

/** Current layers list for useSyncExternalStore. */
export function getLayersTouching(): LayersTouchingItem[] {
  return snapshot.items
}

/** Selection key for the current publish (debug / equality). */
export function getLayersTouchingSeedKey(): string {
  return snapshot.seedKey
}

function notify() {
  listeners.forEach((fn) => fn())
}

/** What the Layers list asks the publisher to load. */
export type LayersPublishScope = 'all' | 'touching'

let publishScope: LayersPublishScope = 'touching' // Default: selection cluster, not the whole board
const scopeListeners = new Set<Listener>() // UI + publisher stay in sync

/** Current publish scope for useSyncExternalStore. */
export function getLayersPublishScope(): LayersPublishScope {
  return publishScope
}

/** Subscribe when the filter switches All ↔ touching. */
export function subscribeLayersPublishScope(fn: Listener): () => void {
  scopeListeners.add(fn)
  return () => {
    scopeListeners.delete(fn) // Drop on unmount so a closed panel stops notifying
  }
}

/** Layers filter sets this; publisher republishes the matching set. */
export function setLayersPublishScope(next: LayersPublishScope) {
  if (publishScope === next) return // Same scope — skip a full recapture
  publishScope = next
  scopeListeners.forEach((fn) => fn())
}

/** Clear the list (utility closed / left layers mode / nothing selected). */
export function clearLayersTouching() {
  if (snapshot.items.length === 0 && snapshot.seedKey === '') return
  snapshot = { items: [], seedKey: '' }
  notify()
}

/** Replace the list (publisher). Keeps prior thumbs for the same ids while new captures land. */
export function publishLayersTouching(items: LayersTouchingItem[], seedKey: string) {
  const prevById = new Map(snapshot.items.map((i) => [i.id, i]))
  const merged = items.map((item) => {
    const prev = prevById.get(item.id)
    if (prev?.previewUrl && !item.previewUrl) {
      return { ...item, previewUrl: prev.previewUrl } // Keep last-good thumb during recapture
    }
    return item
  })
  snapshot = { items: merged, seedKey }
  notify()
}

/** Patch preview URLs onto existing rows without reshuffling. */
export function patchLayersTouchingPreviews(urls: Record<string, string>) {
  let changed = false
  const next = snapshot.items.map((item) => {
    const url = urls[item.id]
    if (!url || item.previewUrl === url) return item
    changed = true
    return { ...item, previewUrl: url }
  })
  if (!changed) return
  snapshot = { ...snapshot, items: next }
  notify()
}

/** Sync RF selection onto existing rows — blue border without a full recapture (All mode). */
export function patchLayersTouchingSelection(selectedIds: Set<string>) {
  let changed = false
  const next = snapshot.items.map((item) => {
    const selected = selectedIds.has(item.id)
    if (item.selected === selected) return item
    changed = true
    return { ...item, selected }
  })
  if (!changed) return
  snapshot = { ...snapshot, items: next }
  notify()
}

/**
 * Reorder the layers list (top = front). Updates stored zIndex labels to match
 * (n…1). Caller applies the same order to RF node zIndex.
 */
export function reorderLayersTouching(orderedIds: string[]): LayersTouchingItem[] {
  const byId = new Map(snapshot.items.map((i) => [i.id, i]))
  const n = orderedIds.length
  const items: LayersTouchingItem[] = []
  for (let i = 0; i < orderedIds.length; i++) {
    const prev = byId.get(orderedIds[i])
    if (!prev) continue
    items.push({ ...prev, zIndex: n - i }) // Top row = highest z
  }
  // Preserve any ids the caller omitted (shouldn't happen)
  for (const item of snapshot.items) {
    if (!orderedIds.includes(item.id)) items.push(item)
  }
  snapshot = { ...snapshot, items }
  notify()
  return items
}

/**
 * Map list order (top→front) onto RF node zIndex without reordering the nodes array
 * (array moves remount TipTap). Returns the z assigned per id.
 */
export function layerZIndexByOrder(
  orderedIds: string[],
  nodes: Array<{ id: string; zIndex?: number }>
): Map<string, number> {
  const idSet = new Set(orderedIds)
  let maxOther = 0
  for (const n of nodes) {
    if (idSet.has(n.id)) continue
    const z = typeof n.zIndex === 'number' ? n.zIndex : 0
    if (z > maxOther) maxOther = z
  }
  const count = orderedIds.length
  const zById = new Map<string, number>()
  orderedIds.forEach((id, i) => {
    zById.set(id, maxOther + (count - i)) // Top = front
  })
  return zById
}

/** Frame stack key from saved metadata (Layers reorder) or edge-snap index. */
export function layerZIndexFromMeta(meta?: Record<string, unknown> | null): number | undefined {
  if (typeof meta?.zIndex === 'number' && Number.isFinite(meta.zIndex)) return meta.zIndex // Layers order wins
  return undefined // Caller may still apply a stack-index fallback
}

/** Persist Layers z-order on frames (messages.metadata) and drawings (canvas_nodes.data). */
export function persistLayerZIndex(
  conversationId: string,
  nodes: Array<{
    id: string
    type?: string
    data?: { promptMessage?: { id?: string } } & Record<string, unknown>
  }>,
  zById: Map<string, number>
): void {
  if (!conversationId || zById.size === 0) return
  void (async () => {
    const { createClient } = await import('@/lib/supabase/client')
    const supabase = createClient()
    for (const n of nodes) {
      const z = zById.get(n.id)
      if (z == null) continue
      if (n.type === 'chatPanel') {
        const messageId = n.data?.promptMessage?.id
        if (!messageId) continue
        const { data: row } = await supabase.from('messages').select('metadata').eq('id', messageId).maybeSingle()
        if (!row) continue
        const meta = { ...((row.metadata as Record<string, unknown>) || {}), zIndex: z }
        await supabase.from('messages').update({ metadata: meta }).eq('id', messageId)
        continue
      }
      if (n.type !== 'freehand' && n.type !== 'shape') continue
      const { data: row } = await supabase.from('canvas_nodes').select('data').eq('id', n.id).maybeSingle()
      if (!row) continue
      const data = { ...((row.data as Record<string, unknown>) || {}), zIndex: z }
      await supabase.from('canvas_nodes').update({ data }).eq('id', n.id)
    }
  })()
}

type Box = {
  id: string
  minX: number
  minY: number
  maxX: number
  maxY: number
  zIndex: number
  kind: LayersTouchingItem['kind']
  label: string
  selected: boolean
}

/** True for map objects that belong in the Layers list. */
export function isLayerableNode(node: Node): boolean {
  return node.type === 'chatPanel' || node.type === 'freehand' || node.type === 'shape'
}

/** Plain label for a frame from metadata / content. */
function frameLabel(node: Node): string {
  const data = node.data as {
    promptMessage?: { content?: string; metadata?: Record<string, unknown> }
  } | undefined
  const meta = data?.promptMessage?.metadata
  const title = typeof meta?.blockTitle === 'string' ? meta.blockTitle.trim() : ''
  if (title) return title
  const html = data?.promptMessage?.content || ''
  const plain = html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  if (plain) return plain.length > 40 ? `${plain.slice(0, 40)}…` : plain
  return 'Frame'
}

function nodeKind(node: Node): LayersTouchingItem['kind'] {
  if (node.type === 'freehand') return 'freehand'
  if (node.type === 'shape') return 'shape'
  return 'frame'
}

function nodeLabel(node: Node): string {
  if (node.type === 'freehand') return 'Drawing'
  if (node.type === 'shape') return 'Shape'
  return frameLabel(node)
}

/** Flow-space AABB for a measured RF node. */
export function layerableNodeBox(node: Node): Box | null {
  if (!isLayerableNode(node)) return null
  const style = (node.style || {}) as { width?: number | string; height?: number | string }
  const styleW = typeof style.width === 'number' ? style.width : Number(style.width)
  const styleH = typeof style.height === 'number' ? style.height : Number(style.height)
  const w =
    typeof node.width === 'number' && node.width > 0
      ? node.width
      : Number.isFinite(styleW) && styleW > 0
        ? styleW
        : 80
  const h =
    typeof node.height === 'number' && node.height > 0
      ? node.height
      : Number.isFinite(styleH) && styleH > 0
        ? styleH
        : 40
  if (w < 1 || h < 1) return null
  const x = node.position?.x ?? 0
  const y = node.position?.y ?? 0
  return {
    id: node.id,
    minX: x,
    minY: y,
    maxX: x + w,
    maxY: y + h,
    zIndex: typeof node.zIndex === 'number' ? node.zIndex : 0,
    kind: nodeKind(node),
    label: nodeLabel(node),
    selected: !!node.selected,
  }
}

function boxesTouch(a: Box, b: Box, pad: number): boolean {
  return !(a.maxX + pad < b.minX || b.maxX + pad < a.minX || a.maxY + pad < b.minY || b.maxY + pad < a.minY)
}

/**
 * Seed ids = selected layerable nodes, plus endpoints of any selected thread.
 * Flood-fill through AABB touch (pad) to get the touching cluster.
 */
export function computeTouchingLayerItems(
  nodes: Node[],
  edges: Edge[],
  pad = TOUCH_PAD
): { items: LayersTouchingItem[]; seedKey: string } {
  const boxes = nodes.map(layerableNodeBox).filter((b): b is Box => !!b)
  const byId = new Map(boxes.map((b) => [b.id, b]))

  const seeds = new Set<string>()
  for (const b of boxes) {
    if (b.selected) seeds.add(b.id)
  }
  for (const e of edges) {
    if (!e.selected) continue
    if (byId.has(e.source)) seeds.add(e.source)
    if (byId.has(e.target)) seeds.add(e.target)
  }

  const seedKey = [
    ...[...seeds].sort(),
    ...edges.filter((e) => e.selected).map((e) => `e:${e.id}`).sort(),
  ].join('|')

  if (seeds.size === 0) {
    return { items: [], seedKey: seedKey || '' }
  }

  const cluster = new Set<string>(seeds)
  const queue = [...seeds]
  while (queue.length) {
    const id = queue.pop()!
    const box = byId.get(id)
    if (!box) continue
    for (const other of boxes) {
      if (cluster.has(other.id)) continue
      if (!boxesTouch(box, other, pad)) continue
      cluster.add(other.id)
      queue.push(other.id)
    }
  }

  const items = sortedLayerItems(
    [...cluster].map((id) => byId.get(id)!).filter(Boolean) // Cluster boxes, front first
  )

  return { items, seedKey }
}

/** Every layerable node on the board, front first — Layers filter “All”. */
export function computeAllLayerItems(nodes: Node[]): { items: LayersTouchingItem[]; seedKey: string } {
  const boxes = nodes.map(layerableNodeBox).filter((b): b is Box => !!b) // Frames, drawings, shapes only
  const items = sortedLayerItems(boxes)
  const seedKey = `all:${items.map((i) => i.id).sort().join(',')}` // Membership, not selection
  return { items, seedKey }
}

/** Front (higher zIndex) first, then stable id. */
function sortedLayerItems(boxes: Box[]): LayersTouchingItem[] {
  return [...boxes]
    .sort((a, b) => b.zIndex - a.zIndex || a.id.localeCompare(b.id))
    .map((b) => ({
      id: b.id,
      kind: b.kind,
      label: b.label,
      zIndex: b.zIndex,
      selected: b.selected,
    }))
}

/** PNG thumbnail via node-only capture (light fill, hi-DPI — not pane JPEG). */
export async function captureNodeLayerPreview(nodeId: string): Promise<string | undefined> {
  const { captureNodePreviewImage } = await import('@/lib/captures')
  return captureNodePreviewImage(nodeId)
}
