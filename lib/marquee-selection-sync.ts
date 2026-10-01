// Drag-select must follow the rectangle, not a stuck drag flag or a same-sized previous set.
// React Flow's marquee only emits select changes when the *count* changes, and getNodesInside
// always includes `node.dragging` — so the frame you just moved stays selected outside the box.

import { getConnectedEdges } from 'reactflow' // Threads that touch the frames inside the rect
import type { Edge, Node, NodeChange, EdgeChange } from 'reactflow'

type MarqueeRect = { x: number; y: number; width: number; height: number } // Pane pixels, same as RF userSelectionRect

type MarqueeState = {
  userSelectionActive: boolean // True only while the rect is being drawn
  userSelectionRect: MarqueeRect | null // Live box
  transform: [number, number, number] // Viewport x, y, zoom
  nodeInternals: Map<string, Node> // Measured boxes
  edges: Edge[] // For thread selection
  getNodes: () => Node[] // Diff against current selected flags
  onNodesChange?: ((changes: NodeChange[]) => void) | null
  onEdgesChange?: ((changes: EdgeChange[]) => void) | null
}

let phoneOwnsMarquee = false // Phone hit-test is partial; don't let the desktop full-box pass undo it

/** Phone marquee owns selection until the finger lifts. */
export function setPhoneMarqueeOwnsSelection(next: boolean): void {
  phoneOwnsMarquee = next // Desktop sync bails while this is set
}

/** True when the whole frame box sits inside the marquee. Ignores `node.dragging`. */
function frameFullyInside(node: Node, rect: MarqueeRect, transform: [number, number, number]): boolean {
  const width = node.width // Measured box — unmeasured frames are not "inside"
  const height = node.height
  if (typeof width !== 'number' || typeof height !== 'number' || width <= 0 || height <= 0) return false
  const zoom = transform[2]
  if (!zoom) return false
  const left = (rect.x - transform[0]) / zoom // Pane rect → flow
  const top = (rect.y - transform[1]) / zoom
  const right = left + rect.width / zoom
  const bottom = top + rect.height / zoom
  const x = node.positionAbsolute?.x ?? node.position.x // Flow left
  const y = node.positionAbsolute?.y ?? node.position.y
  return x >= left - 0.5 && y >= top - 0.5 && x + width <= right + 0.5 && y + height <= bottom + 0.5
}

function selectDiff<T extends { id: string; selected?: boolean }>(
  items: T[],
  selectedIds: Set<string>
): { id: string; type: 'select'; selected: boolean }[] {
  const changes: { id: string; type: 'select'; selected: boolean }[] = []
  for (const item of items) {
    const next = selectedIds.has(item.id) // Wanted flag
    if (!!item.selected !== next) changes.push({ id: item.id, type: 'select', selected: next })
  }
  return changes
}

/**
 * Replace the marquee selection with frames whose boxes are fully inside the rect.
 * Call on every store update while `userSelectionActive` so a same-count move still updates.
 */
export function syncMarqueeSelection(state: MarqueeState): void {
  if (phoneOwnsMarquee) return // Phone path hit-tests partial overlap itself
  if (!state.userSelectionActive || !state.userSelectionRect) return
  const rect = state.userSelectionRect
  const hit: Node[] = []
  state.nodeInternals.forEach((node) => {
    if (node.hidden || node.selectable === false) return // Same skip as RF's selection pass
    if (frameFullyInside(node, rect, state.transform)) hit.push(node) // Geometry only — not dragging
  })
  const nodeIds = new Set(hit.map((node) => node.id))
  const nodeChanges = selectDiff(state.getNodes(), nodeIds)
  if (nodeChanges.length) state.onNodesChange?.(nodeChanges as NodeChange[])
  const edgeIds = new Set(getConnectedEdges(hit, state.edges).map((edge) => edge.id))
  const edgeChanges = selectDiff(state.edges, edgeIds)
  if (edgeChanges.length) state.onEdgesChange?.(edgeChanges as EdgeChange[])
}
