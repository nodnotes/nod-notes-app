import { Position, type Node, type XYPosition } from 'reactflow' // Node box → mid-side attach point
import { normalizeHandleId, INDICATOR_OUTSET } from './handle-ids' // left-indicator → left; exit stub length
import { readFrameChromePad } from '@/lib/frame-chrome-offset' // Selected L/R gutter — not part of the fill
import { isBoardNavigating } from '@/lib/board-navigating' // Skip layout reads while the viewport is moving
import { isFrameDragging } from '@/lib/frame-dragging' // Skip layout reads while a frame is moving
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
 * Panel border box in node-local flow px.
 * `offset*` ignores viewport zoom, and negative chrome margins show up as a negative offset,
 * so this is the box on screen — not the last RF measure, which zoom does not refresh.
 */
function paintedPanelBox(
  nodeId: string,
  duringZoom = false // Selected chrome moves every tick — that read happens after layout, not in render
): { dx: number; dy: number; w: number; h: number; padX: number; yTop: number; yBottom: number } | null {
  if (typeof document === 'undefined' || isFrameDragging()) return null // A drag already moves the node every tick
  if (!duringZoom && isBoardNavigating()) return null // Idle threads wait until the gesture settles
  const nodeEl = document.querySelector(
    `.react-flow__node[data-id="${CSS.escape(nodeId)}"]`
  ) as HTMLElement | null // The RF node the thread is attached to
  const panel = nodeEl?.querySelector('[data-panel-container="true"]') as HTMLElement | null // Blue box / fill
  if (!nodeEl || !panel || panel.offsetWidth < 1 || panel.offsetHeight < 1) return null // Not painted yet
  let dx = 0 // Panel border left, relative to the node border
  let dy = 0 // Panel border top — negative when the adjust box hangs above the fill origin
  let el: HTMLElement | null = panel // Walk offset parents until the RF node
  let reached = false // True once the sum is relative to the node, not the page
  while (el && el !== nodeEl) {
    dx += el.offsetLeft // Includes a negative marginLeft from the L/R gutter
    dy += el.offsetTop // Includes a negative marginTop from the top adjust band
    const parent = el.offsetParent as HTMLElement | null // Next positioned ancestor
    if (parent === nodeEl) {
      reached = true // Offsets above are already node-local
      break
    }
    if (!parent || !nodeEl.contains(parent)) return null // Left the node — don't use a page-relative sum
    el = parent
  }
  if (!reached) return null // Could not relate the panel to this node
  return {
    dx, // Flow px from the node origin to the painted left
    dy, // Flow px from the node origin to the painted top
    w: panel.offsetWidth, // Painted width, gutters included
    h: panel.offsetHeight, // Painted height, T/B bands included
    padX: parseFloat(panel.getAttribute('data-tt-chrome-pad-x') || '') || 0, // L/R gutter inside that box
    yTop: parseFloat(panel.getAttribute('data-tt-chrome-pad-y-top') || '') || 0, // Top band inside that box
    yBottom: parseFloat(panel.getAttribute('data-tt-chrome-pad-y-bottom') || '') || 0, // Bottom band inside that box
  }
}

/** Side point on the painted panel. All four sides stay on the fill, not the blue adjust box. */
function pointOnPaintedPanel(
  origin: XYPosition,
  box: { dx: number; dy: number; w: number; h: number; padX: number; yTop: number; yBottom: number },
  side: Position
): XYPosition | null {
  const left = origin.x + box.dx + box.padX // Peach left — skip the L/R gutter
  const top = origin.y + box.dy + box.yTop // Peach top — skip the property band
  const fillW = Math.max(1, box.w - box.padX * 2) // Fill width inside the adjust box
  const fillH = Math.max(1, box.h - box.yTop - box.yBottom) // Fill height inside the T/B bands
  const midX = left + fillW / 2 // Horizontal center of the fill
  const midY = top + fillH / 2 // Vertical center of the fill
  switch (side) {
    case Position.Left:
      return { x: left, y: midY } // Peach left, not the blue gutter
    case Position.Right:
      return { x: left + fillW, y: midY } // Peach right
    case Position.Top:
      return { x: midX, y: top } // Peach top — selecting must not slide this onto the blue edge
    case Position.Bottom:
      return { x: midX, y: top + fillH } // Peach bottom
    default:
      return null
  }
}

/**
 * Painted fill edge after layout.
 * Selected zoom resizes the adjust box; deselect removes it. Either way this is the box on screen,
 * not the node width captured while chrome was on.
 */
export function connectionPointPainted(
  node: Node | undefined,
  side: Position | undefined
): XYPosition | null {
  if (!node || !side) return null // No frame or side to meet
  if (Math.abs(frameRotationFromNode(node)) > 0.5 || frameShapeFromNode(node)) return null // Those stay on the formula
  const box = paintedPanelBox(node.id, true) // Read even during a zoom settle — layout has already committed
  if (!box) return null // Panel not in the document yet
  const x = node.positionAbsolute?.x ?? node.position.x // Node origin in flow space
  const y = node.positionAbsolute?.y ?? node.position.y
  return pointOnPaintedPanel({ x, y }, box, side) // Peach edge — chrome pads are skipped when they are present
}

/**
 * Mid-side point on a node's **frame** edge (the connection **point**).
 * Ignores outer indicator Handle positions entirely.
 * When selected, RF width includes the adjust gutters — inset by `frameChromePad` so threads
 * meet the peach fill on every side, not the blue adjust box.
 * A shaped frame meets the silhouette: the side ray from the center stops on the outline.
 */
export function connectionPointOnNode(
  node: Node | undefined,
  side: Position | undefined
): XYPosition | null {
  if (!node || !side) return null
  const x = node.positionAbsolute?.x ?? node.position.x
  const y = node.positionAbsolute?.y ?? node.position.y
  const upright = Math.abs(frameRotationFromNode(node)) <= 0.5 // Content rotation uses the AABB math below
  if (upright && !frameShapeFromNode(node)) {
    const painted = paintedPanelBox(node.id) // Live box — zoom moves chrome without a new RF measure
    if (painted) return pointOnPaintedPanel({ x, y }, painted, side) // Meet the box that is actually painted
  }
  const w = node.width ?? 0
  const h = node.height ?? 0
  if (w <= 0 || h <= 0) return null // Not measured yet — caller falls back to RF coords
  // Fill box = RF node minus selection chrome (⋮⋮ gutters + T/B property/connection bands).
  const pad = readFrameChromePad(node.data)
  const { yTop, yBottom } = readChromeYBands(node.id)
  // Upright RF XY is the fill origin (negative margins grow the painted box). T/B bands
  // are extra height on the node — subtract them so top and bottom meet the fill, not the blue edge.
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
      return { x: fillX + fillW / 2, y: fillY } // Peach top — do not step up into the property band
    case Position.Bottom:
      return { x: fillX + fillW / 2, y: fillY + fillH } // Peach bottom — do not step into the connections band
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
