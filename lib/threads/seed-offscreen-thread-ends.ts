// Culled frames never mount, so React Flow never measures their connection points.
// A thread stays out of the SVG until both ends have a box and handle bounds.
// Stamp those from the known box so the stroke can paint before the far frame enters the view.

import { internalsSymbol, Position, type Node } from 'reactflow' // RF node bag + the non-enumerable internals symbol

/** One connection point in the shape EdgeRenderer already expects. */
type HandleBox = {
  id: string | null // left / right / top / bottom / tip
  position: Position // Which side the stroke leaves from
  x: number // Flow px from the node origin
  y: number // Flow px from the node origin
  width: number // Tiny box — the point is the center of this side
  height: number
}

/** Fields RF hangs off the node with a symbol (not copied by object spread). */
type NodeBag = {
  handleBounds?: { source: HandleBox[] | null; target: HandleBox[] | null } | null
  z?: number // Stacking copied so a re-stamp does not drop the frame behind the board
}

type BagNode = Node & { [internalsSymbol]?: NodeBag } // Node plus the symbol bag

/** Edge ends this seeder needs — hidden threads are not drawn. */
type ThreadEnd = { source: string; target: string; hidden?: boolean }

/** Store slice that owns the live node map. */
type ThreadEndStore = {
  getState: () => { nodeInternals: Map<string, Node>; edges: ThreadEnd[] }
  setState: (partial: { nodeInternals: Map<string, Node> }) => void
}

const busy = new WeakSet<object>() // setState notifies this subscriber — do not stamp again in that turn
const stamped = new WeakMap<object, { nodes: Map<string, Node>; edges: ThreadEnd[] }>() // Skip pan ticks that did not change nodes or threads

/** Finite size above zero, or null. */
function positive(value: unknown): number | null {
  const n = typeof value === 'number' ? value : typeof value === 'string' ? parseFloat(value) : NaN // Style may be "120px"
  if (!Number.isFinite(n) || n <= 0) return null // 0 means "not measured"
  return n
}

/** Box React Flow will accept: measured width, styled width, or the saved resize box. */
function readBox(node: Node): { width: number; height: number } | null {
  const style = node.style as { width?: unknown; height?: unknown } | undefined // Block groups store the box here
  const width = positive(node.width) ?? positive(style?.width) // Prefer the live RF measure
  const height = positive(node.height) ?? positive(style?.height)
  if (width && height) return { width, height }
  const dims = (
    node.data as {
      promptMessage?: { metadata?: { resizeDimensions?: { width?: unknown; height?: unknown } } }
    }
  )?.promptMessage?.metadata?.resizeDimensions // Persisted frame box before this frame has mounted
  const savedW = positive(dims?.width)
  const savedH = positive(dims?.height)
  if (savedW && savedH) return { width: savedW, height: savedH }
  return null // No stand-in size — a guessed box would move fit-to-view
}

/** True once RF (or a previous stamp) stored at least one connection point. */
function handlesReady(node: BagNode): boolean {
  const bounds = node[internalsSymbol]?.handleBounds // Missing until the frame mounts
  if (!bounds) return false
  return (bounds.source?.length ?? 0) + (bounds.target?.length ?? 0) > 0 // A tip only has a target
}

/** Four side points plus the free-end tip, on both source and target lists. */
function syntheticHandles(width: number, height: number): { source: HandleBox[]; target: HandleBox[] } {
  const point = (id: string, position: Position, x: number, y: number): HandleBox => ({
    id, // Must match the thread's sourceHandle / targetHandle
    position,
    x,
    y,
    width: 1, // getHandlePosition centers Left/Right on this height
    height: 1,
  })
  const sides = [
    point('left', Position.Left, 0, height / 2), // Mid left edge
    point('right', Position.Right, width, height / 2), // Mid right edge
    point('top', Position.Top, width / 2, 0), // Mid top edge
    point('bottom', Position.Bottom, width / 2, height), // Mid bottom edge
    point('tip', Position.Left, width / 2, height / 2), // Board free end
  ]
  return { source: sides, target: sides } // Loose mode reads either list
}

/** Copy the node with a box and connection points, or null when it already has both. */
function seededEndpoint(node: Node | undefined): Node | null {
  if (!node || node.hidden) return null // Hidden frames clear bounds on purpose
  const box = readBox(node) // Nothing to attach to without a size
  if (!box) return null
  const bagNode = node as BagNode
  const sized = positive(node.width) != null && positive(node.height) != null // Filter checks these fields, not style
  const ready = handlesReady(bagNode)
  if (sized && ready) return null // Real measure wins — do not replace it
  const next: Node = {
    ...node,
    width: sized ? node.width : box.width, // So the thread AABB can include this end
    height: sized ? node.height : box.height,
    positionAbsolute: node.positionAbsolute ?? { x: node.position.x, y: node.position.y }, // EdgeRenderer rejects a missing absolute
  }
  const prev = bagNode[internalsSymbol] // Keep z when replacing the bag
  Object.defineProperty(next, internalsSymbol, {
    enumerable: false, // Same as React Flow — spread must not leak this into node JSON
    value: {
      ...prev,
      handleBounds: ready ? prev?.handleBounds : syntheticHandles(box.width, box.height), // Unmounted end still has a point to leave from
    },
  })
  return next
}

/** New node map when any thread end is missing a box or connection points. */
export function patchOffscreenThreadEnds(
  nodeInternals: Map<string, Node>,
  edges: ThreadEnd[]
): Map<string, Node> | null {
  let next: Map<string, Node> | null = null // Allocated only when something changes
  const seen = new Set<string>() // Each frame once, even if many threads share it
  for (const edge of edges) {
    if (edge.hidden) continue // Filtered-out threads are not drawn
    for (const id of [edge.source, edge.target]) {
      if (seen.has(id)) continue
      seen.add(id)
      const current = (next ?? nodeInternals).get(id) // See a stamp made earlier in this pass
      const patched = seededEndpoint(current)
      if (!patched) continue
      if (!next) next = new Map(nodeInternals) // Copy so untouched frames keep their object identity
      next.set(id, patched)
    }
  }
  return next
}

/** Write connection points for thread ends that React Flow has not mounted yet. */
export function seedOffscreenThreadEnds(store: ThreadEndStore): void {
  if (busy.has(store)) return // The set below notifies subscribers immediately
  const { nodeInternals, edges } = store.getState()
  const prev = stamped.get(store) // Same map during a pan — nothing new to stamp
  if (prev && prev.nodes === nodeInternals && prev.edges === edges) return
  const next = patchOffscreenThreadEnds(nodeInternals, edges)
  if (!next) {
    stamped.set(store, { nodes: nodeInternals, edges }) // Remember this pair so the next pan tick is a no-op
    return
  }
  busy.add(store)
  try {
    store.setState({ nodeInternals: next }) // EdgeRenderer reads this map, not the React nodes array
    stamped.set(store, { nodes: next, edges }) // The re-entrant subscriber sees this and returns
  } finally {
    busy.delete(store)
  }
}
