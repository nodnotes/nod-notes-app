// Alignment guides while a frame is dragged: left/center/right and top/center/bottom of the adjust box.
// Lives outside React so publishing a guide does not re-render the board.

import type { Node } from 'reactflow' // Type only — runtime `Node` is not a value
import { frameAdjustFlowBox, frameAdjustFlowBoxAt, type FlowBox } from '@/lib/frame-adjust-box' // Blue-box geometry

/** Screen px within which a dragged frame sticks to another frame's matching edge. */
const ALIGN_SCREEN_PX = 6
/** Extra screen px the segment sticks out past the frames it joins. */
const LINE_EXTEND_PX = 4
/** Flow px — another frame sharing this coordinate lengthens the same segment. */
const ON_LINE_EPS = 0.5

export type FrameAlignGuide = {
  orientation: 'horizontal' | 'vertical' // Which way the segment runs
  position: number // Flow x (vertical line) or y (horizontal line)
  from: number // Flow start along the segment
  to: number // Flow end along the segment
}

type Box = { x: number; y: number; x2: number; y2: number } // Axis-aligned flow box
type Axis = 'vertical' | 'horizontal' // Guide orientation (vertical line aligns X)
type AnchorKind = 'start' | 'center' | 'end' // Left/top, center, right/bottom
type PosChange = {
  type: string
  id?: string
  dragging?: boolean
  position?: { x: number; y: number }
  positionAbsolute?: { x: number; y: number }
}

const EMPTY: FrameAlignGuide[] = [] // Stable empty snapshot so idle store reads do not notify
let guides: FrameAlignGuide[] = EMPTY
const listeners = new Set<() => void>()

/** Current segments. Same reference until the set actually changes. */
export function readFrameAlignGuides(): FrameAlignGuide[] {
  return guides
}

/** Overlay subscribes here instead of BoardFlow state. */
export function subscribeFrameAlignGuides(listener: () => void): () => void {
  listeners.add(listener) // Paint when a segment appears, moves, or clears
  return () => listeners.delete(listener)
}

/** Replace the visible segments. No-ops when the geometry is unchanged. */
export function setFrameAlignGuides(next: FrameAlignGuide[]): void {
  if (sameGuides(guides, next)) return // Avoid a canvas paint on every drag tick that missed
  guides = next.length === 0 ? EMPTY : next
  listeners.forEach((listener) => listener())
}

/** Drop guides when a drag ends without another position tick. */
export function clearFrameAlignGuides(): void {
  setFrameAlignGuides(EMPTY)
}

/** True when this batch is a frame move — those skip the snap-toggle helper lines. */
export function isFrameAlignDrag(changes: PosChange[], nodes: Node[]): boolean {
  for (const change of changes) {
    if (change.type !== 'position' || !change.dragging || !change.id) continue
    const node = nodes.find((n) => n.id === change.id)
    if (node?.type === 'chatPanel') return true // A frame is in this drag
  }
  return false
}

/**
 * Snap dragged frames onto other frames' matching adjust-box edges and publish the segments.
 * Same-edge only (left↔left, center↔center, right↔right) so flush stack snap keeps the gap.
 */
export function applyFrameAlignGuides<T extends PosChange>(
  changes: T[],
  nodes: Node[],
  zoom: number,
): T[] {
  const z = Math.max(0.01, zoom || 1) // Guard a zero zoom so the radius stays finite
  const threshold = ALIGN_SCREEN_PX / z // Magnet radius in flow px
  const byId = new Map(nodes.map((node) => [node.id, node]))
  const draggingIds = new Set<string>()
  for (const change of changes) {
    if (change.type === 'position' && change.dragging && change.id) draggingIds.add(change.id)
  }
  if (draggingIds.size === 0) {
    clearFrameAlignGuides() // Release, select, or resize — lines are drag-only
    return changes
  }

  const movingParts: Box[] = []
  for (const change of changes) {
    if (change.type !== 'position' || !change.dragging || !change.position || !change.id) continue
    const node = byId.get(change.id)
    if (!node || node.type !== 'chatPanel' || node.hidden || frameOnThread(node)) continue
    const origin = originOf(node, change.position, nodes) // Pointer position, not the last snap
    const box = flowToBox(frameAdjustFlowBoxAt(node, origin, z)) // Align the adjust box, not the fill
    if (box.x2 - box.x < 1 || box.y2 - box.y < 1) continue // Unmeasured frame has no edge to align
    movingParts.push(box)
  }
  if (movingParts.length === 0) {
    clearFrameAlignGuides() // On-thread frames stay on the path; no alignment line
    return changes
  }

  const moving = unionBoxes(movingParts) // One box so a multi-select stays rigid
  const peers: Box[] = []
  for (const node of nodes) {
    if (node.type !== 'chatPanel' || node.hidden || draggingIds.has(node.id)) continue
    const box = flowToBox(frameAdjustFlowBox(node, nodes, z)) // Other frames contribute their adjust box
    if (box.x2 - box.x < 1 || box.y2 - box.y < 1) continue // Unmeasured frames are not targets
    peers.push(box)
  }
  if (peers.length === 0) {
    clearFrameAlignGuides()
    return changes
  }

  const xMatch = bestMatch('vertical', moving, peers, threshold) // Left / center / right
  const yMatch = bestMatch('horizontal', moving, peers, threshold) // Top / center / bottom
  const dx = xMatch?.delta ?? 0
  const dy = yMatch?.delta ?? 0
  const snapped: Box = {
    x: moving.x + dx,
    y: moving.y + dy,
    x2: moving.x2 + dx,
    y2: moving.y2 + dy,
  }
  const next: FrameAlignGuide[] = []
  if (xMatch) next.push(segment('vertical', xMatch.line, snapped, peers, z))
  if (yMatch) next.push(segment('horizontal', yMatch.line, snapped, peers, z))
  setFrameAlignGuides(next)
  if (!dx && !dy) return changes // Already sitting on the line — paint only

  return changes.map((change) => {
    if (change.type !== 'position' || !change.dragging || !change.position || !change.id) return change
    const node = byId.get(change.id)
    if (node && frameOnThread(node)) return change // Path constraint owns this frame
    const position = { x: change.position.x + dx, y: change.position.y + dy } // Same delta keeps a multi-select rigid
    if (!change.positionAbsolute) return { ...change, position }
    return {
      ...change,
      position,
      positionAbsolute: {
        x: change.positionAbsolute.x + dx,
        y: change.positionAbsolute.y + dy,
      },
    }
  })
}

/** Page-absolute flow position. One parent level — groups are usually siblings. */
function absFlowPosition(node: Node, nodes: Node[]): { x: number; y: number } {
  if (!node.parentId) return { x: node.position.x, y: node.position.y }
  const parent = nodes.find((n) => n.id === node.parentId)
  return {
    x: (parent?.position.x ?? 0) + node.position.x,
    y: (parent?.position.y ?? 0) + node.position.y,
  }
}

/** Adjust box → axis-aligned edges used by the guide search. */
function flowToBox(box: FlowBox): Box {
  return { x: box.x, y: box.y, x2: box.x + box.width, y2: box.y + box.height }
}

function frameOnThread(node: Node): boolean {
  const data = node.data as { promptMessage?: { metadata?: { onThread?: unknown } } } | undefined
  return Boolean(data?.promptMessage?.metadata?.onThread) // Slides on a thread, not the board plane
}

function originOf(
  node: Node,
  rel: { x: number; y: number },
  nodes: Node[],
): { x: number; y: number } {
  if (!node.parentId) return { x: rel.x, y: rel.y } // Page-absolute already
  const parent = nodes.find((n) => n.id === node.parentId)
  if (!parent) return { x: rel.x, y: rel.y }
  const parentAbs = absFlowPosition(parent, nodes)
  return { x: parentAbs.x + rel.x, y: parentAbs.y + rel.y } // RF position is parent-relative
}

function unionBoxes(boxes: Box[]): Box {
  let x = Infinity
  let y = Infinity
  let x2 = -Infinity
  let y2 = -Infinity
  for (const box of boxes) {
    x = Math.min(x, box.x)
    y = Math.min(y, box.y)
    x2 = Math.max(x2, box.x2)
    y2 = Math.max(y2, box.y2)
  }
  return { x, y, x2, y2 }
}

function anchors(box: Box, axis: Axis): { kind: AnchorKind; pos: number }[] {
  if (axis === 'vertical') {
    return [
      { kind: 'start', pos: box.x }, // Left
      { kind: 'center', pos: (box.x + box.x2) / 2 },
      { kind: 'end', pos: box.x2 }, // Right
    ]
  }
  return [
    { kind: 'start', pos: box.y }, // Top
    { kind: 'center', pos: (box.y + box.y2) / 2 },
    { kind: 'end', pos: box.y2 }, // Bottom
  ]
}

function bestMatch(
  axis: Axis,
  moving: Box,
  peers: Box[],
  threshold: number,
): { delta: number; line: number } | null {
  const movingAnchors = anchors(moving, axis)
  let best: { delta: number; line: number; dist: number; gap: number } | null = null
  for (const peer of peers) {
    const peerAnchors = anchors(peer, axis)
    const gap = boxGap(moving, peer) // Closer frame wins a tie
    for (const source of movingAnchors) {
      for (const target of peerAnchors) {
        if (source.kind !== target.kind) continue // Opposite edges belong to stack snap
        const delta = target.pos - source.pos // Shift that lands this edge on the peer
        const dist = Math.abs(delta)
        if (dist > threshold) continue
        if (!best || dist < best.dist || (dist === best.dist && gap < best.gap)) {
          best = { delta, line: target.pos, dist, gap }
        }
      }
    }
  }
  return best
}

function boxGap(a: Box, b: Box): number {
  const dx = Math.max(0, Math.max(a.x - b.x2, b.x - a.x2)) // 0 when the boxes overlap on X
  const dy = Math.max(0, Math.max(a.y - b.y2, b.y - a.y2))
  return Math.hypot(dx, dy)
}

function segment(
  orientation: Axis,
  line: number,
  snapped: Box,
  peers: Box[],
  zoom: number,
): FrameAlignGuide {
  const pad = LINE_EXTEND_PX / zoom // Keep the overhang a constant screen length
  let from = orientation === 'vertical' ? snapped.y : snapped.x
  let to = orientation === 'vertical' ? snapped.y2 : snapped.x2
  for (const peer of peers) {
    const shares = anchors(peer, orientation).some((anchor) => Math.abs(anchor.pos - line) <= ON_LINE_EPS)
    if (!shares) continue // This frame is not on the guide
    const peerFrom = orientation === 'vertical' ? peer.y : peer.x
    const peerTo = orientation === 'vertical' ? peer.y2 : peer.x2
    from = Math.min(from, peerFrom)
    to = Math.max(to, peerTo)
  }
  return { orientation, position: line, from: from - pad, to: to + pad }
}

function sameGuides(a: FrameAlignGuide[], b: FrameAlignGuide[]): boolean {
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i++) {
    const left = a[i]
    const right = b[i]
    if (!left || !right) return false
    if (left.orientation !== right.orientation) return false
    if (Math.abs(left.position - right.position) > 0.01) return false
    if (Math.abs(left.from - right.from) > 0.01) return false
    if (Math.abs(left.to - right.to) > 0.01) return false
  }
  return true
}
