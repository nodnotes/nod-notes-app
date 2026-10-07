// Infinite board camera limits + soft content AABB.
// Pan is already unbounded (RF default translateExtent = ±Infinity). These helpers only grow
// zoom min/max and a soft world rect used by fitView / minimap framing — never clamp pan.

export type BoardZoomRange = { minZoom: number; maxZoom: number }

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

/** Camera scale at the 200% label. Same far stop as the old max zoom-out; the label stays 200. */
export const BOARD_ZOOM_OUT_SCALE = 0.01

/** Camera scale at the 50% label (max zoom-in). */
export const BOARD_ZOOM_IN_SCALE = 2

/** Default camera band: 50% zoom-in (scale 2) through 200% zoom-out (scale 0.01). */
export const BOARD_ZOOM_DEFAULT: BoardZoomRange = { minZoom: BOARD_ZOOM_OUT_SCALE, maxZoom: BOARD_ZOOM_IN_SCALE }

/** Absolute clamps — same as default; content-based expand cannot exceed this band. */
export const BOARD_ZOOM_HARD: BoardZoomRange = { minZoom: BOARD_ZOOM_OUT_SCALE, maxZoom: BOARD_ZOOM_IN_SCALE }

/** Nav percent → scale. 50% → 2, 100% → 1. Past 100% the scale falls on a log curve to 0.01 at 200%. */
export function navPercentToZoom(percent: number): number {
  const p = Math.max(BOARD_NAV_PERCENT_MIN, Math.min(BOARD_NAV_PERCENT_MAX, percent)) // Stay inside 50%–200%
  if (p <= BOARD_NAV_PERCENT_DEFAULT) return BOARD_NAV_PERCENT_DEFAULT / p // 50% is scale 2; 100% is scale 1
  const t = (p - BOARD_NAV_PERCENT_DEFAULT) / (BOARD_NAV_PERCENT_MAX - BOARD_NAV_PERCENT_DEFAULT) // 0 at 100%, 1 at 200%
  return Math.pow(BOARD_ZOOM_OUT_SCALE, t) // 200% lands on the far zoom-out without a higher label
}

/** Scale → nav percent, unrounded so a scrub does not jump. 100% is the default view. */
export function zoomToNavPercentExact(zoom: number): number {
  if (!(zoom > 0)) return BOARD_NAV_PERCENT_MAX // Non-positive scale is max zoom-out
  if (zoom >= 1) return BOARD_NAV_PERCENT_DEFAULT / zoom // Scale 1 → 100%, scale 2 → 50%
  const t = Math.log(zoom) / Math.log(BOARD_ZOOM_OUT_SCALE) // Inverse of the zoom-out curve
  return BOARD_NAV_PERCENT_DEFAULT + t * (BOARD_NAV_PERCENT_MAX - BOARD_NAV_PERCENT_DEFAULT) // Scale 0.01 → 200%
}

/** Rounded nav label, clamped to 50%–200%. */
export function zoomToNavPercent(zoom: number): number {
  return Math.round(
    Math.max(BOARD_NAV_PERCENT_MIN, Math.min(BOARD_NAV_PERCENT_MAX, zoomToNavPercentExact(zoom)))
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
 * Grow zoom min/max so the user can keep zooming out/in after placing or resizing content.
 * - At (or past) the current floor while zooming out → lower minZoom
 * - At (or past) the current ceiling while zooming in → raise maxZoom
 * - Huge frames relative to the pane → lower min so fitView can frame them
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
  let minZoom = current.minZoom
  let maxZoom = current.maxZoom
  const { liveZoom, paneW, paneH, contentW, contentH } = opts

  if (liveZoom != null) {
    if (liveZoom <= minZoom + ZOOM_EXPAND_EPS) {
      minZoom = Math.max(BOARD_ZOOM_HARD.minZoom, minZoom * 0.7)
    }
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
    // Zoom needed to fit this one item with ~20% padding
    const fit = Math.min((paneW * 0.8) / contentW, (paneH * 0.8) / contentH)
    if (fit < minZoom) minZoom = Math.max(BOARD_ZOOM_HARD.minZoom, fit * 0.85)
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

/** Same range? Avoid needless ReactFlow prop churn. */
export function zoomRangesEqual(a: BoardZoomRange, b: BoardZoomRange): boolean {
  return Math.abs(a.minZoom - b.minZoom) < 1e-6 && Math.abs(a.maxZoom - b.maxZoom) < 1e-6
}

export function softBoundsEqual(a: SoftBoardBounds, b: SoftBoardBounds): boolean {
  return a.minX === b.minX && a.minY === b.minY && a.maxX === b.maxX && a.maxY === b.maxY
}
