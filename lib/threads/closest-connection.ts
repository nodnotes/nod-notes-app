// Closest connection-point pair whose straight path does not enter either frame.
// A thread dropped on a frame (not a simulated connection point) uses this pair,
// and keeps updating it as the frames move.

import { Position, type Node, type XYPosition } from 'reactflow' // Four sides + flow points
import { connectionPointOnNode, sideFromHandleId } from '@/components/threads/connection-point-on-node' // Same attach point the stroke uses
import { readFrameChromePad } from '@/lib/frame-chrome-offset' // Selected gutter is not part of the fill

/** One side the pair picker tries. */
const SIDES = [Position.Left, Position.Right, Position.Top, Position.Bottom] as const

/** Axis-aligned fill box, or null when the node is not measured yet. */
function nodeFillBox(node: Node): { x: number; y: number; w: number; h: number } | null {
  const pad = readFrameChromePad(node.data) // 0 unless this frame is selected
  const x = (node.positionAbsolute?.x ?? node.position.x) + pad.x // Fill left
  const y = (node.positionAbsolute?.y ?? node.position.y) + pad.y // Fill top
  const w = (node.width ?? 0) - pad.x * 2 // Fill width
  const h = (node.height ?? 0) - pad.y * 2 // Fill height
  if (w < 2 || h < 2) return null // Not laid out — no box to test
  return { x, y, w, h } // The frame the stroke must not cross
}

/** True when the flow point sits on this node's fill (the connection box). */
export function pointerInNodeFill(node: Node, x: number, y: number): boolean {
  const box = nodeFillBox(node) // Fill rectangle in flow space
  if (!box) return false // Unmeasured nodes are not drop targets
  return x >= box.x && y >= box.y && x <= box.x + box.w && y <= box.y + box.h // Edges count as the frame
}

/** Topmost frame whose fill contains the point, excluding the drag source. */
export function nodeUnderFillPointer(
  nodes: Iterable<Node>, // Live frames, drawings, and shapes
  sourceId: string, // Frame the thread is leaving
  x: number, // Pointer X in flow space
  y: number // Pointer Y in flow space
): Node | null {
  let best: Node | null = null // Frame the pointer is inside
  let bestZ = -Infinity // Higher z wins when fills overlap
  for (const node of nodes) {
    if (node.id === sourceId || node.hidden || node.type === 'threadTip') continue // Not the source, not a board tip
    if (!pointerInNodeFill(node, x, y)) continue // Adjust box and empty board are not the frame
    const z = typeof node.zIndex === 'number' ? node.zIndex : 0 // Paint order
    if (z >= bestZ) {
      best = node // This fill is the one under the pointer
      bestZ = z
    }
  }
  return best
}

/** True when the segment from `from` steps into the frame instead of away from that side. */
function leavesOutward(side: Position, from: XYPosition, to: XYPosition): boolean {
  if (side === Position.Left) return to.x < from.x - 0.5 // Left point must leave left
  if (side === Position.Right) return to.x > from.x + 0.5 // Right point must leave right
  if (side === Position.Top) return to.y < from.y - 0.5 // Top point must leave up
  if (side === Position.Bottom) return to.y > from.y + 0.5 // Bottom point must leave down
  return false
}

/** True when the open segment crosses the frame interior (the boundary itself does not count). */
function segmentHitsInterior(
  a: XYPosition, // Segment start
  b: XYPosition, // Segment end
  box: { x: number; y: number; w: number; h: number } // Fill box
): boolean {
  const inset = 3 // Stay off the edge so the connection point itself is not a hit
  const x0 = box.x + inset // Interior left
  const y0 = box.y + inset // Interior top
  const x1 = box.x + box.w - inset // Interior right
  const y1 = box.y + box.h - inset // Interior bottom
  if (x1 <= x0 || y1 <= y0) return false // Box too small to have an interior
  let t0 = 0 // Entry along the segment
  let t1 = 1 // Exit along the segment
  const dx = b.x - a.x // Segment X
  const dy = b.y - a.y // Segment Y
  const p = [-dx, dx, -dy, dy] // Liang-Barsky planes
  const q = [a.x - x0, x1 - a.x, a.y - y0, y1 - a.y] // Distance to each plane
  for (let i = 0; i < 4; i++) {
    if (p[i] === 0) {
      if (q[i] < 0) return false // Parallel and outside
    } else {
      const r = q[i] / p[i] // Hit on this plane
      if (p[i] < 0) {
        if (r > t1) return false // Enters after the segment ends
        if (r > t0) t0 = r // Tighten the entry
      } else if (r < t0) {
        return false // Exits before the segment starts
      } else if (r < t1) {
        t1 = r // Tighten the exit
      }
    }
  }
  return t0 < t1 // A span of the segment lies inside
}

/** True when these sides step into a frame or the straight path crosses a fill. */
export function connectionOverlapsFrames(
  source: Node, // Frame the thread leaves
  target: Node, // Frame the thread joins
  sourceHandle: string | null | undefined, // Current source side
  targetHandle: string | null | undefined // Current target side
): boolean {
  const sourceSide = sideFromHandleId(sourceHandle, undefined) // left/right/top/bottom
  const targetSide = sideFromHandleId(targetHandle, undefined)
  if (!sourceSide || !targetSide) return true // Missing side — let the closest pair fill it in
  const from = connectionPointOnNode(source, sourceSide) // Point the stroke leaves
  const to = connectionPointOnNode(target, targetSide) // Point the stroke arrives
  const sourceBox = nodeFillBox(source) // Source fill
  const targetBox = nodeFillBox(target) // Target fill
  if (!from || !to || !sourceBox || !targetBox) return false // Not measured — don't reshuffle yet
  if (!leavesOutward(sourceSide, from, to) || !leavesOutward(targetSide, to, from)) return true // Side faces into a frame
  if (segmentHitsInterior(from, to, sourceBox) || segmentHitsInterior(from, to, targetBox)) return true // Chord crosses a fill
  return false // This pair already stays outside
}

/** Closest side pair that leaves both frames and does not cross either fill. */
export function closestClearConnection(
  source: Node, // Frame the thread starts on
  target: Node // Frame the thread is joining
): { sourceHandle: string; targetHandle: string } | null {
  const sourceBox = nodeFillBox(source) // Source interior
  const targetBox = nodeFillBox(target) // Target interior
  if (!sourceBox || !targetBox) return null // Wait until both are measured
  let best: { sourceHandle: string; targetHandle: string; distance: number } | null = null // Winning clear pair
  let fallback: { sourceHandle: string; targetHandle: string; distance: number } | null = null // Shortest pair if every pair overlaps
  for (const sourceSide of SIDES) {
    const from = connectionPointOnNode(source, sourceSide) // Point on this source side
    if (!from) continue // Side has no anchor yet
    for (const targetSide of SIDES) {
      const to = connectionPointOnNode(target, targetSide) // Point on this target side
      if (!to) continue // Side has no anchor yet
      const distance = Math.hypot(to.x - from.x, to.y - from.y) // Straight-line closeness
      const pair = { sourceHandle: sourceSide, targetHandle: targetSide, distance } // Position values are the handle ids
      if (!fallback || distance < fallback.distance) fallback = pair // Always keep a pair
      if (!leavesOutward(sourceSide, from, to) || !leavesOutward(targetSide, to, from)) continue // Would enter a frame at the point
      if (segmentHitsInterior(from, to, sourceBox) || segmentHitsInterior(from, to, targetBox)) continue // Path crosses a fill
      if (!best || distance < best.distance) best = pair // Shorter clear path wins
    }
  }
  const chosen = best ?? fallback // Clear path, or the shortest path when the frames overlap
  if (!chosen) return null // No measured sides
  return { sourceHandle: chosen.sourceHandle, targetHandle: chosen.targetHandle } // Handle ids for the edge
}
