import { Position, type Node, type XYPosition } from 'reactflow' // Node box → mid-side attach point
import { normalizeHandleId, INDICATOR_OUTSET } from './handle-ids' // left-indicator → left; exit stub length
import { readFrameChromePad } from '@/lib/frame-chrome-offset' // Selected L/R gutter — not part of the fill
import {
  parseFrameShape,
  shapeSideAnchor,
  type FrameShapeSide,
  type FrameShapeType,
} from '@/lib/frame-shape' // Silhouette hit for shaped frames

/** Selected T/B chrome bands — not stored on frameChromePad (upright uses margins). */
function readChromeYBands(nodeId: string): { yTop: number; yBottom: number } {
  if (typeof document === 'undefined') return { yTop: 0, yBottom: 0 }
  const el = document.querySelector(
    `.react-flow__node[data-id="${CSS.escape(nodeId)}"] [data-panel-container="true"]`
  ) as HTMLElement | null
  if (!el) return { yTop: 0, yBottom: 0 }
  return {
    yTop: parseFloat(el.getAttribute('data-tt-chrome-pad-y-top') || '') || 0,
    yBottom: parseFloat(el.getAttribute('data-tt-chrome-pad-y-bottom') || '') || 0,
  }
}

/** Side name used by silhouette anchors (`left` / `right` / `top` / `bottom`). */
function shapeSideName(side: Position): FrameShapeSide | null {
  if (side === Position.Left) return 'left'
  if (side === Position.Right) return 'right'
  if (side === Position.Top) return 'top'
  if (side === Position.Bottom) return 'bottom'
  return null
}

/** Silhouette id stored on the frame node (live data, else persisted metadata). */
function frameShapeFromNode(node: Node): FrameShapeType | null {
  const data = node.data as
    | {
        frameShape?: unknown
        promptMessage?: { metadata?: { frameShape?: unknown } }
      }
    | undefined
  return (
    parseFrameShape(data?.frameShape) ??
    parseFrameShape(data?.promptMessage?.metadata?.frameShape)
  )
}

/** Degrees the fill is turned, or 0 when the frame is upright. */
function frameRotationFromNode(node: Node): number {
  const rot = (
    node.data as { promptMessage?: { metadata?: { rotation?: unknown } } } | undefined
  )?.promptMessage?.metadata?.rotation
  return typeof rot === 'number' ? rot : 0
}

/** Unrotated content box the silhouette is drawn in (before the AABB grows). */
function frameContentSize(node: Node): { width: number; height: number } | null {
  const dims = (
    node.data as {
      promptMessage?: { metadata?: { resizeDimensions?: { width?: unknown; height?: unknown } } }
    } | undefined
  )?.promptMessage?.metadata?.resizeDimensions
  if (!dims || typeof dims.width !== 'number' || typeof dims.height !== 'number') return null
  if (dims.width < 1 || dims.height < 1) return null
  return { width: dims.width, height: dims.height }
}

/**
 * Mid-side point on a node's **frame** edge (the connection **point**).
 * Ignores outer indicator Handle positions entirely.
 * When selected, RF width includes the adjust gutters — inset by `frameChromePad` so threads
 * meet the peach fill, not the blue adjust box. Left/right use the adjust-box vertical center
 * (the simulated dots), unless a group selection is hiding those dots.
 * A shaped frame meets the silhouette: the side ray from the center stops on the outline.
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
  // Fill box = RF node minus selection chrome (⋮⋮ gutters + T/B property/connection bands).
  const pad = readFrameChromePad(node.data)
  const { yTop, yBottom } = readChromeYBands(node.id)
  // Upright RF XY is the fill origin (negative margins grow the painted box). T/B bands
  // are extra height on the node — subtract them to find the fill, then attach T/B on the adjust box.
  const fillX = x + pad.x
  const fillY = y + pad.y
  const fillW = Math.max(1, w - pad.x * 2)
  const fillH = Math.max(1, h - pad.y * 2 - yTop - yBottom)
  const fillMidY = fillY + fillH / 2 // Text line — not the taller adjust box
  const shape = frameShapeFromNode(node)
  const shapeSide = shapeSideName(side)
  if (shape && shapeSide) {
    const anchor = shapeSideAnchor(shape, shapeSide) // Unit point on the outline
    const rot = frameRotationFromNode(node)
    if (Math.abs(rot) > 0.5) {
      // Rotated fill is centered in the upright AABB — turn the local anchor with it.
      const content = frameContentSize(node) ?? { width: fillW, height: fillH }
      const lx = (anchor.x - 0.5) * content.width // Local X from the shape center
      const ly = (anchor.y - 0.5) * content.height
      const rad = (rot * Math.PI) / 180
      const c = Math.cos(rad)
      const s = Math.sin(rad)
      return {
        x: x + w / 2 + lx * c - ly * s, // Same rotation as the painted fill
        y: y + h / 2 + lx * s + ly * c,
      }
    }
    return {
      x: fillX + anchor.x * fillW, // On the slant / vertex, not the empty box corner
      y: fillY + anchor.y * fillH,
    }
  }
  switch (side) {
    case Position.Left:
      return { x: fillX, y: fillMidY } // Peach edge, vertical center of the fill
    case Position.Right:
      return { x: fillX + fillW, y: fillMidY } // Same mid — the adjust box can be taller
    case Position.Top:
      return { x: fillX + fillW / 2, y: fillY - yTop } // Adjust-box top (above properties)
    case Position.Bottom:
      return { x: fillX + fillW / 2, y: fillY + fillH + yBottom } // Adjust-box bottom (below connections)
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
