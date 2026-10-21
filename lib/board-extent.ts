// Board camera limits: live 200% zoom floor + pan clamped to default board bounds.
// Empty boards use the min pane-multiple board; content grows those bounds.

import { zoomIdentity } from 'd3-zoom' // Custom constrain must return a real d3 Transform
import {
  BOARD_BOUNDS_MIN_PANE_SCALE,
  minimapBoardBounds,
  type MinimapFlowRect,
} from '@/lib/minimap-geometry'

export type BoardZoomRange = { minZoom: number; maxZoom: number }

/** RF `translateExtent` — flow-space enclosure the viewport must stay inside. */
export type BoardTranslateExtent = [[number, number], [number, number]]

/** Unbounded pan (only while the pane is unmeasured). */
export const BOARD_TRANSLATE_EXTENT_INFINITE: BoardTranslateExtent = [
  [-Infinity, -Infinity],
  [Infinity, Infinity],
]

export type SoftBoardBounds = {
  minX: number
  minY: number
  maxX: number
  maxY: number
}

/** Nav label at max zoom-out. Higher percent is farther out; the number does not pass 200. */
export const BOARD_NAV_PERCENT_MAX = 200

/** Nav label at max zoom-in (scale 2). The band does not go below 50%. */
export const BOARD_NAV_PERCENT_MIN = 50

/** Nav label for the default view (scale 1). */
export const BOARD_NAV_PERCENT_DEFAULT = 100

/**
 * Absolute far floor for enormous boards (hard clamp only).
 * Live **200%** is always `getBoardZoom200` (fit current board bounds) — never zoom past that.
 */
export const BOARD_ZOOM_OUT_SCALE = 0.01

/** Camera scale at the 50% label (max zoom-in). */
export const BOARD_ZOOM_IN_SCALE = 2

/**
 * Default camera band before pane measure: 50% in … default-board 200% (1 / min pane scale).
 * Do not start at the hard 0.01 floor — that let the camera pass the labeled 200% stop.
 */
export const BOARD_ZOOM_DEFAULT: BoardZoomRange = {
  minZoom: 1 / BOARD_BOUNDS_MIN_PANE_SCALE, // Matches roomy empty / tiny-content 200%
  maxZoom: BOARD_ZOOM_IN_SCALE,
}

/** Absolute clamps — live minZoom is the 200% fit; hard min only caps huge-board fits. */
export const BOARD_ZOOM_HARD: BoardZoomRange = { minZoom: BOARD_ZOOM_OUT_SCALE, maxZoom: BOARD_ZOOM_IN_SCALE }

/**
 * Scale that fits `bounds` in the pane (no extra pad — callers put gap into bounds).
 */
export function zoomToFitBounds(
  bounds: { width: number; height: number },
  paneW: number,
  paneH: number,
  hard: BoardZoomRange = BOARD_ZOOM_HARD
): number {
  if (paneW <= 0 || paneH <= 0 || bounds.width <= 0 || bounds.height <= 0) {
    return clampBoardZoom(1, hard) // Empty → classic scale-1
  }
  return clampBoardZoom(Math.min(paneW / bounds.width, paneH / bounds.height), hard)
}

/**
 * Default board bounds: content + size-based gap (bigger content → more air), then ≥ min× pane
 * with pane aspect (`minimapBoardBounds`). Empty boards still get the min pane-multiple board
 * (roomy 200%); null only when pane is unmeasured.
 */
export function getLiveBoardBounds(
  content: MinimapFlowRect | null,
  paneW: number,
  paneH: number
): MinimapFlowRect | null {
  if (paneW <= 0 || paneH <= 0) return null // Pane not measured yet
  const pane = { x: 0, y: 0, width: paneW, height: paneH } // Min board size + aspect source
  return minimapBoardBounds(content, pane, null) // Size-based gap — not the tight expand gap
}

/**
 * One pane of flow on every side of the 200% fit box.
 * At max zoom-out the furthest object can travel to the opposite edge and just leave the view.
 * Do not fit 200% to this box — that would make view == world and cancel the travel.
 */
export function expandBoundsForCrossScreenPan(
  bounds: MinimapFlowRect,
  paneW: number,
  paneH: number,
  zoom: number
): MinimapFlowRect {
  const z = zoom > 0 ? zoom : 1 // Guard a 0 floor so pad stays finite
  const padX = paneW > 0 ? paneW / z : 0 // Screen width in flow — left object can fully exit right
  const padY = paneH > 0 ? paneH / z : 0
  return {
    x: bounds.x - padX,
    y: bounds.y - padY,
    width: bounds.width + padX * 2,
    height: bounds.height + padY * 2,
  }
}

/** RF translateExtent for live board bounds — infinite only while pane is unmeasured. */
export function boardTranslateExtent(
  bounds: MinimapFlowRect | null
): BoardTranslateExtent {
  if (!bounds || bounds.width <= 0 || bounds.height <= 0) return BOARD_TRANSLATE_EXTENT_INFINITE
  return [
    [bounds.x, bounds.y],
    [bounds.x + bounds.width, bounds.y + bounds.height],
  ]
}

/** True when both extents are the same finite (or both infinite) box. */
export function translateExtentsEqual(a: BoardTranslateExtent, b: BoardTranslateExtent): boolean {
  return (
    a[0][0] === b[0][0] &&
    a[0][1] === b[0][1] &&
    a[1][0] === b[1][0] &&
    a[1][1] === b[1][1]
  )
}

/**
 * Clamp a viewport against `translateExtent` (board bounds).
 *
 * Unlike d3-zoom’s defaultConstrain, when the view is **larger** than the board we do
 * **not** center on the board — that yanked the camera onto a newly created frame at 100%.
 * Instead we only nudge so the board stays on screen (no-op if it already is).
 * When the view is smaller than the board (zoomed in), keep the view inside the board.
 */
export function clampViewportToTranslateExtent(
  vp: { x: number; y: number; zoom: number },
  extent: BoardTranslateExtent,
  paneW: number,
  paneH: number
): { x: number; y: number; zoom: number } {
  const z = vp.zoom > 0 ? vp.zoom : 1
  if (!(paneW > 0) || !(paneH > 0)) return { ...vp, zoom: z }
  const [[x0, y0], [x1, y1]] = extent
  if (![x0, y0, x1, y1].every(Number.isFinite)) return { ...vp, zoom: z }

  const viewW = paneW / z // Flow-space width of the pane
  const viewH = paneH / z // Flow-space height of the pane
  const worldW = x1 - x0
  const worldH = y1 - y0
  let viewLeft = -vp.x / z // Flow x at the left edge of the pane
  let viewTop = -vp.y / z // Flow y at the top edge of the pane

  if (viewW >= worldW) {
    // Board fits in the view horizontally — keep board on screen, never center
    const minLeft = x1 - viewW // Furthest left the view may sit
    const maxLeft = x0 // Furthest right the view may sit
    if (viewLeft > maxLeft) viewLeft = maxLeft // Board was slipping off the left
    if (viewLeft < minLeft) viewLeft = minLeft // Board was slipping off the right
  } else {
    // View smaller than board — keep the view inside the board
    const minLeft = x0
    const maxLeft = x1 - viewW
    if (viewLeft < minLeft) viewLeft = minLeft
    if (viewLeft > maxLeft) viewLeft = maxLeft
  }

  if (viewH >= worldH) {
    const minTop = y1 - viewH
    const maxTop = y0
    if (viewTop > maxTop) viewTop = maxTop
    if (viewTop < minTop) viewTop = minTop
  } else {
    const minTop = y0
    const maxTop = y1 - viewH
    if (viewTop < minTop) viewTop = minTop
    if (viewTop > maxTop) viewTop = maxTop
  }

  return {
    x: -viewLeft * z,
    y: -viewTop * z,
    zoom: z,
  }
}

/** Clamp using the live RF store’s translateExtent + pane size. */
export function clampViewportAgainstStore(
  vp: { x: number; y: number; zoom: number },
  state: {
    translateExtent: BoardTranslateExtent
    width: number
    height: number
  }
): { x: number; y: number; zoom: number } {
  return clampViewportToTranslateExtent(vp, state.translateExtent, state.width, state.height)
}

/**
 * Replace d3-zoom’s default constrain (which centers when view > world) with
 * `clampViewportToTranslateExtent` so create / pan / wheel never yank to frame center.
 */
export function applyBoardD3Constrain(d3Zoom: {
  constrain: (
    fn: (
      transform: { x: number; y: number; k: number },
      extent: [[number, number], [number, number]],
      translateExtent: BoardTranslateExtent
    ) => { x: number; y: number; k: number }
  ) => unknown
}): void {
  d3Zoom.constrain((transform, extent, translateExtent) => {
    const paneW = extent[1][0] - extent[0][0]
    const paneH = extent[1][1] - extent[0][1]
    const next = clampViewportToTranslateExtent(
      { x: transform.x, y: transform.y, zoom: transform.k },
      translateExtent,
      paneW,
      paneH
    )
    return zoomIdentity.translate(next.x, next.y).scale(next.zoom)
  })
}

/**
 * Live **200%**: zoom + center that fits default board bounds into the pane.
 * Bounds = content + equal gap on every side (or min pane-multiple when empty); pane aspect from fit.
 * Unmeasured pane falls back to the default min-board scale at the origin.
 */
export function getBoardZoom200(
  content: MinimapFlowRect | null,
  paneW: number,
  paneH: number,
  hard: BoardZoomRange = BOARD_ZOOM_HARD,
  revealZoom?: number | null // Hide-large-overlap: sit at/under the scale that shows a giant frame
): { zoom: number; centerX: number; centerY: number } {
  const bounds = getLiveBoardBounds(content, paneW, paneH)
  if (!bounds) {
    const empty = clampBoardZoom(1 / BOARD_BOUNDS_MIN_PANE_SCALE, hard) // Default roomy 200%
    return {
      zoom: revealZoom != null && revealZoom > 0 ? Math.min(empty, clampBoardZoom(revealZoom, hard)) : empty,
      centerX: 0,
      centerY: 0,
    }
  }
  let zoom = zoomToFitBounds(bounds, paneW, paneH, hard)
  // Fit-bounds can still leave a giant overlapping frame above FADE_HIDE_FRAC — pull 200% out
  if (revealZoom != null && revealZoom > 0) zoom = Math.min(zoom, clampBoardZoom(revealZoom, hard))
  return {
    zoom,
    centerX: bounds.x + bounds.width / 2,
    centerY: bounds.y + bounds.height / 2,
  }
}

/** @deprecated Use `getBoardZoom200` — fit-to-bounds is the 200% stop. */
export const getBoardZoom100 = getBoardZoom200

/**
 * Nav percent → scale.
 * `z200` = fit board bounds (live 200%). 100% → scale 1 (not past z200); 50% → max zoom-in.
 */
export function navPercentToZoom(percent: number, z200 = 1): number {
  const p = Math.max(BOARD_NAV_PERCENT_MIN, Math.min(BOARD_NAV_PERCENT_MAX, percent))
  const zOut = z200 > 0 ? z200 : 1 // 200% meets board bounds
  const zMid = Math.max(zOut, 1) // 100% is scale 1, never more zoomed out than 200%
  if (p <= BOARD_NAV_PERCENT_DEFAULT) {
    return clampBoardZoom(zMid * (BOARD_NAV_PERCENT_DEFAULT / p)) // 50% → 2× mid when mid is 1
  }
  if (zMid <= zOut + 1e-9) return clampBoardZoom(zOut) // Small board: 100% and 200% coincide
  const t = (p - BOARD_NAV_PERCENT_DEFAULT) / (BOARD_NAV_PERCENT_MAX - BOARD_NAV_PERCENT_DEFAULT)
  return clampBoardZoom(zMid * Math.pow(zOut / zMid, t)) // Log scrub down to fit-bounds
}

/** Scale → nav percent, unrounded. `z200` is the fit-bounds scale labeled 200%. */
export function zoomToNavPercentExact(zoom: number, z200 = 1): number {
  if (!(zoom > 0)) return BOARD_NAV_PERCENT_MAX
  const zOut = z200 > 0 ? z200 : 1
  const zMid = Math.max(zOut, 1)
  if (zoom >= zMid - 1e-9) {
    return BOARD_NAV_PERCENT_DEFAULT * (zMid / zoom) // At/above mid → 100% … 50%
  }
  if (zMid <= zOut + 1e-9) return BOARD_NAV_PERCENT_MAX
  const t = Math.log(zoom / zMid) / Math.log(zOut / zMid)
  return BOARD_NAV_PERCENT_DEFAULT + t * (BOARD_NAV_PERCENT_MAX - BOARD_NAV_PERCENT_DEFAULT)
}

/** Rounded nav label, clamped to 50%–200%. */
export function zoomToNavPercent(zoom: number, z200 = 1): number {
  return Math.round(
    Math.max(
      BOARD_NAV_PERCENT_MIN,
      Math.min(BOARD_NAV_PERCENT_MAX, zoomToNavPercentExact(zoom, z200))
    )
  )
}

/** Clamp a zoom value to the camera band (200% zoom-out … 50% zoom-in). */
export function clampBoardZoom(
  zoom: number,
  hard: BoardZoomRange = BOARD_ZOOM_HARD
): number {
  return Math.min(hard.maxZoom, Math.max(hard.minZoom, zoom))
}

/** Extra pad (flow px) when content approaches the soft world edge. */
export const BOARD_BOUNDS_PAD_FLOW = 800

/** Grow the soft world when a frame sits within this many flow px of an edge. */
export const BOARD_BOUNDS_NEAR_EDGE_FLOW = 400

const ZOOM_EXPAND_EPS = 0.001 // Treat being this close to a zoom limit as “at the limit”

/** Seed soft bounds around the origin so an empty board still has a sensible fit region. */
export function emptySoftBounds(seed = 2000): SoftBoardBounds {
  return { minX: -seed, minY: -seed, maxX: seed, maxY: seed }
}

/** Union a frame (or any AABB) into soft bounds, expanding when it sits near an edge. */
export function expandSoftBounds(
  bounds: SoftBoardBounds,
  box: { x: number; y: number; width: number; height: number },
  pad = BOARD_BOUNDS_PAD_FLOW,
  near = BOARD_BOUNDS_NEAR_EDGE_FLOW
): SoftBoardBounds {
  const left = box.x
  const top = box.y
  const right = box.x + Math.max(1, box.width)
  const bottom = box.y + Math.max(1, box.height)
  let { minX, minY, maxX, maxY } = bounds
  if (left - near < minX) minX = left - pad
  if (top - near < minY) minY = top - pad
  if (right + near > maxX) maxX = right + pad
  if (bottom + near > maxY) maxY = bottom + pad
  // Always include the box itself even when far from edges (first content)
  minX = Math.min(minX, left - pad * 0.25)
  minY = Math.min(minY, top - pad * 0.25)
  maxX = Math.max(maxX, right + pad * 0.25)
  maxY = Math.max(maxY, bottom + pad * 0.25)
  return { minX, minY, maxX, maxY }
}

/** Rebuild soft bounds from every live node (startup / large imports). */
export function softBoundsFromNodes(
  nodes: Array<{
    position: { x: number; y: number }
    width?: number | null // RF types these as nullable; the typeof checks below handle null
    height?: number | null
    style?: { width?: number | string; height?: number | string }
    type?: string
  }>
): SoftBoardBounds {
  let next = emptySoftBounds()
  let any = false
  for (const n of nodes) {
    if (n.type === 'frameShimmer' || n.type === 'placeholder') continue
    const w =
      typeof n.width === 'number'
        ? n.width
        : typeof n.style?.width === 'number'
          ? n.style.width
          : parseFloat(String(n.style?.width ?? '')) || 220
    const h =
      typeof n.height === 'number'
        ? n.height
        : typeof n.style?.height === 'number'
          ? n.style.height
          : parseFloat(String(n.style?.height ?? '')) || 72
    next = expandSoftBounds(next, { x: n.position.x, y: n.position.y, width: w, height: h })
    any = true
  }
  return any ? next : emptySoftBounds()
}

/**
 * Grow zoom max so the user can keep zooming in after placing tiny content.
 * Live **minZoom** is the 200% fit (`getBoardZoom200`) — do not lower it past board bounds on gesture.
 */
export function expandZoomRange(
  current: BoardZoomRange,
  opts: {
    liveZoom?: number
    paneW?: number
    paneH?: number
    contentW?: number
    contentH?: number
  } = {}
): BoardZoomRange {
  let minZoom = current.minZoom // Floor stays content-fit (set via applyBoardZoomFloor)
  let maxZoom = current.maxZoom
  const { liveZoom, paneW, paneH, contentW, contentH } = opts

  if (liveZoom != null) {
    // Only unlock further zoom-in at the ceiling — never push past live 200%
    if (liveZoom >= maxZoom - ZOOM_EXPAND_EPS) {
      maxZoom = Math.min(BOARD_ZOOM_HARD.maxZoom, maxZoom * 1.35)
    }
  }

  if (
    paneW &&
    paneH &&
    contentW &&
    contentH &&
    paneW > 0 &&
    paneH > 0 &&
    contentW > 0 &&
    contentH > 0
  ) {
    // Tiny item → allow zooming in further so it can fill the pane
    const fill = Math.max(paneW / Math.max(contentW, 1), paneH / Math.max(contentH, 1))
    if (fill > maxZoom) maxZoom = Math.min(BOARD_ZOOM_HARD.maxZoom, Math.max(fill * 0.5, maxZoom))
  }

  if (minZoom > maxZoom) {
    const mid = (minZoom + maxZoom) / 2
    minZoom = Math.min(minZoom, mid)
    maxZoom = Math.max(maxZoom, mid)
  }
  return { minZoom, maxZoom }
}

/**
 * Set the live zoom-out floor to the 200% fit of board bounds in the pane.
 * Empty → fit of the min pane-multiple board; with content → fit grown bounds.
 * Never leave the hard 0.01 floor as minZoom — that let wheel/pinch keep zooming
 * while the nav label stuck at 200%.
 */
export function applyBoardZoomFloor(
  current: BoardZoomRange,
  content: MinimapFlowRect | null,
  paneW: number,
  paneH: number,
  hard: BoardZoomRange = BOARD_ZOOM_HARD,
  revealZoom?: number | null // Same reveal as getBoardZoom200 — keep the 200% label on this floor
): BoardZoomRange {
  const fit = getBoardZoom200(content, paneW, paneH, hard, revealZoom).zoom // Live 200% scale
  const maxZoom = Math.min(hard.maxZoom, Math.max(current.maxZoom, fit, BOARD_ZOOM_IN_SCALE))
  return {
    minZoom: Math.min(fit, maxZoom), // Camera must not go past labeled 200%
    maxZoom,
  }
}

/** Same range? Avoid needless ReactFlow prop churn. */
export function zoomRangesEqual(a: BoardZoomRange, b: BoardZoomRange): boolean {
  return Math.abs(a.minZoom - b.minZoom) < 1e-6 && Math.abs(a.maxZoom - b.maxZoom) < 1e-6
}

export function softBoundsEqual(a: SoftBoardBounds, b: SoftBoardBounds): boolean {
  return a.minX === b.minX && a.minY === b.minY && a.maxX === b.maxX && a.maxY === b.maxY
}
