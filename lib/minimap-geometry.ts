/** Flow-space AABB used by minimap viewBox math. */
export type MinimapFlowRect = {
  x: number
  y: number
  width: number
  height: number
}

/** Independent of board camera — 1 fits the board view; higher zooms into the map. */
export const MINIMAP_SCOPE_ZOOM = { min: 0.25, max: 8 } as const

/**
 * Minimum dimmed “out of view” band on each side of the minimap (CSS px).
 * When the board is zoomed out the true viewport can fill the SVG — clamp the hole
 * so this mask always remains visible.
 */
export const MINIMAP_MASK_MIN_CSS_PX = 8

/**
 * Floor board gap (flow px) when content is tiny — roomy padding for 200% / pan enclosure.
 * Larger than the expand gap so the default board is not tight to content.
 */
export const BOARD_BOUNDS_GAP_DEFAULT = 96

/**
 * Live board air as a fraction of content size on that axis — bigger content → bigger gap.
 * Fixed 96 was glued to large frames at 200%; 0.5 → content is ~half the padded box.
 */
export const BOARD_BOUNDS_GAP_RATIO = 0.5

/**
 * Tight gap when bounds only need to clear newly placed content (keep in view).
 * Do not use for the default board / 200% stop.
 */
export const BOARD_BOUNDS_GAP_EXPAND = 8

/**
 * Minimum board size as a multiple of the pane (same aspect).
 * Must be > 1 so live 200% (fit board) is zoomed out past 100% (scale 1).
 * 10 → roomy default; 200% lands at scale 0.1 on a content-small / empty board.
 * (5 felt tight — content still filled too much of the view at max zoom-out.)
 */
export const BOARD_BOUNDS_MIN_PANE_SCALE = 10

/** @deprecated Prefer `BOARD_BOUNDS_GAP_DEFAULT` — was the single shared gap. */
export const MINIMAP_CONTENT_GAP_FLOW = BOARD_BOUNDS_GAP_DEFAULT

/**
 * Per-axis board gap from content size — floor at DEFAULT; grows with the object.
 */
export function boardBoundsGapForAxis(contentPx: number): number {
  return Math.max(BOARD_BOUNDS_GAP_DEFAULT, Math.max(0, contentPx) * BOARD_BOUNDS_GAP_RATIO)
}

/** Keep scope zoom inside the scrub band. */
export function clampMinimapScopeZoom(z: number) {
  return Math.max(MINIMAP_SCOPE_ZOOM.min, Math.min(MINIMAP_SCOPE_ZOOM.max, z))
}

/** Auto mode sizes the board-view hole to this fraction of the minimap (limiting axis). */
export const MINIMAP_AUTO_VIEW_FRACTION = 0.5

/** Axis-aligned intersection; null when the rects miss. */
export function rectIntersection(
  a: MinimapFlowRect,
  b: MinimapFlowRect
): MinimapFlowRect | null {
  const x1 = Math.max(a.x, b.x)
  const y1 = Math.max(a.y, b.y)
  const x2 = Math.min(a.x + a.width, b.x + b.width)
  const y2 = Math.min(a.y + a.height, b.y + b.height)
  if (x2 <= x1 || y2 <= y1) return null
  return { x: x1, y: y1, width: x2 - x1, height: y2 - y1 }
}

/**
 * Default board bounds: content + size-based gap (or a fixed `gap`), then at least
 * `BOARD_BOUNDS_MIN_PANE_SCALE`× the pane with pane aspect — roomy enclosure, and 200%
 * fit is zoomed out past 100%. Pass `BOARD_BOUNDS_GAP_EXPAND` only for a tight clear
 * around new content. Empty boards fall back to the min pane-multiple board.
 * `gap` omitted/`null` → per-axis `boardBoundsGapForAxis` (bigger content → bigger air).
 */
export function minimapBoardBounds(
  content: MinimapFlowRect | null,
  view: MinimapFlowRect, // Pane (or camera) — empty fallback + minimum board size
  gap: number | null = null // null = size-based; number = uniform (expand / overrides)
): MinimapFlowRect {
  // No content → still use the roomy min board so default 200% is zoomed out
  if (!content || content.width <= 0 || content.height <= 0) {
    content = { x: 0, y: 0, width: 1, height: 1 } // Tiny seed at origin → expands to min pane scale
  }
  // Fixed gap (expand) or per-axis air that grows with the content
  const gapX = gap != null ? gap : boardBoundsGapForAxis(content.width)
  const gapY = gap != null ? gap : boardBoundsGapForAxis(content.height)
  const padW = content.width + gapX * 2 // Content + left/right air
  const padH = content.height + gapY * 2 // Content + top/bottom air
  const padX = content.x - gapX
  const padY = content.y - gapY
  // ≥ min× pane so 200% is a roomy zoom-out
  const minW = view.width > 0 ? view.width * BOARD_BOUNDS_MIN_PANE_SCALE : padW
  const minH = view.height > 0 ? view.height * BOARD_BOUNDS_MIN_PANE_SCALE : padH
  let outW = Math.max(padW, minW)
  let outH = Math.max(padH, minH)
  // Match pane aspect so 200% fit has even air (grow the short side)
  if (view.width > 0 && view.height > 0) {
    const aspect = view.width / view.height
    if (outW / outH < aspect) outW = outH * aspect
    else outH = outW / aspect
  }
  // Keep the padded content centered in the expanded board
  return {
    x: padX + padW / 2 - outW / 2,
    y: padY + padH / 2 - outH / 2,
    width: outW,
    height: outH,
  }
}

/**
 * Auto minimap scope so the current board view covers ~50% of the SVG (limiting axis).
 * Frames the live camera (not content). Manual wheel overrides until the next board zoom.
 */
export function minimapScopeForHalfView(
  viewBB: MinimapFlowRect,
  _content: MinimapFlowRect | null,
  elementWidth: number,
  elementHeight: number,
  offsetScale = 5,
  targetFraction = MINIMAP_AUTO_VIEW_FRACTION
): number {
  const boundingRect = minimapBoundingRect(null, viewBB) // Full board view
  if (boundingRect.width <= 0 || boundingRect.height <= 0) return 1
  if (viewBB.width <= 0 || viewBB.height <= 0) return 1
  const fitScale = Math.max(
    boundingRect.width / Math.max(elementWidth, 1),
    boundingRect.height / Math.max(elementHeight, 1)
  ) // Flow units per CSS px at view-fit (scope 1)
  // Same padding factor computeMinimapGeometry uses at scope 1
  const frameW = fitScale * (elementWidth + 2 * offsetScale)
  const frameH = fitScale * (elementHeight + 2 * offsetScale)
  const frac = Math.max(viewBB.width / frameW, viewBB.height / frameH) // Hole share at scope 1
  if (!(frac > 0) || !Number.isFinite(frac)) return 1
  // Hole share scales with scope → pick scope so the share lands on the target
  return clampMinimapScopeZoom(targetFraction / frac)
}

/**
 * Evenodd hole for the out-of-view mask = the full board camera (`viewBB`).
 * Never clipped to content — the square matches what the pane actually shows.
 * A min dimmed band still stays when the camera would fill the SVG.
 */
export function minimapViewportMaskRect(
  viewBB: MinimapFlowRect,
  frame: MinimapFlowRect, // Painted minimap world (geometry x/y/width/height)
  viewScale: number, // Flow units per CSS px on the minimap
  minMaskCssPx = MINIMAP_MASK_MIN_CSS_PX
): MinimapFlowRect {
  const hole = viewBB // Full board view — not content
  const pad = minMaskCssPx * Math.max(viewScale, 1e-6) // Flow inset that must stay dimmed
  const maxW = Math.max(0, frame.width - pad * 2)
  const maxH = Math.max(0, frame.height - pad * 2)
  // Uniform scale when the camera is larger than the inset frame — keep true view aspect
  const fit =
    hole.width > maxW || hole.height > maxH
      ? Math.min(maxW / Math.max(hole.width, 1e-6), maxH / Math.max(hole.height, 1e-6), 1)
      : 1
  const width = hole.width * fit
  const height = hole.height * fit
  // Keep the hole on the camera center, then clamp inside the frame inset
  let x = hole.x + (hole.width - width) / 2
  let y = hole.y + (hole.height - height) / 2
  const minX = frame.x + pad
  const minY = frame.y + pad
  const maxX = frame.x + frame.width - pad - width
  const maxY = frame.y + frame.height - pad - height
  if (maxX >= minX) x = Math.min(Math.max(x, minX), maxX)
  else x = minX
  if (maxY >= minY) y = Math.min(Math.max(y, minY), maxY)
  else y = minY
  return { x, y, width, height }
}

/**
 * World rect the minimap frames against = the live board camera (full board view).
 * Content is ignored — the map follows what the pane shows, not the content AABB.
 */
export function minimapBoundingRect(
  _content: MinimapFlowRect | null,
  view: MinimapFlowRect
): MinimapFlowRect {
  return view
}

/**
 * Full minimap SVG geometry (viewBox + mask), shared by board + preview minimaps.
 *
 * Frames the live board camera (full board view), not content. Scope zooms the
 * minimap around that camera; the mask hole is the same viewBB.
 */
export function computeMinimapGeometry(
  viewBB: MinimapFlowRect,
  content: MinimapFlowRect | null,
  elementWidth: number,
  elementHeight: number,
  offsetScale = 5,
  scopeZoom = 1 // 1 = framing fit; >1 closer look; <1 more padding — not board zoom
) {
  const boundingRect = minimapBoundingRect(content, viewBB) // Full board view
  const scaledWidth = boundingRect.width / Math.max(elementWidth, 1)
  const scaledHeight = boundingRect.height / Math.max(elementHeight, 1)
  const fitScale = Math.max(scaledWidth, scaledHeight) // Flow units per CSS px at view-fit
  const safeScope = Math.max(scopeZoom, 1e-6) // Avoid divide-by-zero from a bad scrub
  const viewScale = fitScale / safeScope // Higher scope → smaller viewBox → frames look larger
  const viewWidth = viewScale * elementWidth
  const viewHeight = viewScale * elementHeight
  const offset = offsetScale * viewScale
  const width = viewWidth + offset * 2
  const height = viewHeight + offset * 2
  // Always center on the board camera so pan updates the map with the view
  const anchorX = viewBB.x + viewBB.width / 2
  const anchorY = viewBB.y + viewBB.height / 2
  const x = anchorX - width / 2
  const y = anchorY - height / 2
  return {
    viewBB,
    boundingRect,
    viewScale,
    offset,
    x,
    y,
    width,
    height,
    viewBox: `${x} ${y} ${width} ${height}`,
  }
}

/** Painted SVG viewBox, the coordinate space the white window is drawn in. */
export function readMinimapViewBox(svg: SVGSVGElement | null): MinimapFlowRect | null {
  const parts = svg?.getAttribute('viewBox')?.trim().split(/[\s,]+/).map(Number) // DOM attribute, not the React prop
  if (!parts || parts.length < 4 || parts.some((n) => !Number.isFinite(n))) return null
  return { x: parts[0], y: parts[1], width: parts[2], height: parts[3] }
}

/** Flow point under a CSS pixel on the minimap. */
export function minimapClientToFlow(
  clientX: number, // Pointer X in viewport CSS pixels
  clientY: number, // Pointer Y in viewport CSS pixels
  svgRect: { left: number; top: number; width: number; height: number },
  viewBox: MinimapFlowRect
): { x: number; y: number } {
  const width = svgRect.width > 0 ? svgRect.width : 1 // Avoid a 0-size SVG before layout
  const height = svgRect.height > 0 ? svgRect.height : 1
  const u = (clientX - svgRect.left) / width // 0 at the SVG's left edge, 1 at the right
  const v = (clientY - svgRect.top) / height
  return {
    x: viewBox.x + u * viewBox.width, // Same mapping the white window uses
    y: viewBox.y + v * viewBox.height,
  }
}

/**
 * Viewport origin that keeps the pointer-down flow point under the pointer.
 * Requires a viewBox that does not move with the camera mid-drag (freeze scope
 * center while panning). Delta scaling drifts; pointer is read in that fixed space.
 */
export function minimapGrabbedViewOrigin(
  pointerX: number,
  pointerY: number,
  downPointerX: number,
  downPointerY: number,
  downViewX: number,
  downViewY: number,
  inversePan = false
): { x: number; y: number } {
  const sign = inversePan ? -1 : 1 // Inverse pan moves the camera opposite the pointer
  return {
    x: downViewX + (pointerX - downPointerX) * sign,
    y: downViewY + (pointerY - downPointerY) * sign,
  }
}
