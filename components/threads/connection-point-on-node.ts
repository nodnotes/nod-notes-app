import { Position, type Node, type XYPosition } from 'reactflow' // Node box → mid-side attach point
import { normalizeHandleId, INDICATOR_OUTSET } from './handle-ids' // left-indicator → left; exit stub length
import { readFrameChromePad } from '@/lib/frame-chrome-offset' // Selected L/R gutter — not part of the fill

/**
 * Mid-side point on a node's **frame** edge (the connection **point**).
 * Ignores outer indicator Handle positions entirely.
 * When selected, RF width includes the adjust gutters — inset by `frameChromePad` so threads
 * meet the peach fill, not the blue adjust box.
 */
export function connectionPointOnNode(
  node: Node | undefined,
  side: Position | undefined
): XYPosition | null {
  if (!node || !side) return null
  const x = node.positionAbsolute?.x ?? node.position.x
  const y = node.positionAbsolute?.y ?? node.position.y
  const w = node.width ?? 0
  const h = node.height ?? 0
  if (w <= 0 || h <= 0) return null // Not measured yet — caller falls back to RF coords
  // Fill box = RF node minus selection chrome (⋮⋮ gutters). Unselected pad is 0.
  const pad = readFrameChromePad(node.data)
  const fillX = x + pad.x
  const fillY = y + pad.y
  const fillW = Math.max(1, w - pad.x * 2)
  const fillH = Math.max(1, h - pad.y * 2)
  switch (side) {
    case Position.Left:
      return { x: fillX, y: fillY + fillH / 2 }
    case Position.Right:
      return { x: fillX + fillW, y: fillY + fillH / 2 }
    case Position.Top:
      return { x: fillX + fillW / 2, y: fillY }
    case Position.Bottom:
      return { x: fillX + fillW / 2, y: fillY + fillH }
    default:
      return null
  }
}

/**
 * Point just outside the frame on a side — same offset as the connection indicator.
 * Threads run straight here before curving so they don't hug the frame edge.
 */
export function exitPointAlongSide(
  origin: XYPosition,
  side: Position | undefined,
  dist: number = INDICATOR_OUTSET
): XYPosition {
  switch (side) {
    case Position.Left:
      return { x: origin.x - dist, y: origin.y }
    case Position.Right:
      return { x: origin.x + dist, y: origin.y }
    case Position.Top:
      return { x: origin.x, y: origin.y - dist }
    case Position.Bottom:
      return { x: origin.x, y: origin.y + dist }
    default:
      return origin
  }
}

/** Resolve which side a handle id refers to (`left-indicator` → Left). */
export function sideFromHandleId(
  handleId: string | null | undefined,
  fallback: Position | undefined
): Position | undefined {
  const id = normalizeHandleId(handleId) || handleId
  if (id === 'left') return Position.Left
  if (id === 'right') return Position.Right
  if (id === 'top') return Position.Top
  if (id === 'bottom') return Position.Bottom
  return fallback
}
