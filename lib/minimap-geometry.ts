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
 * Extra dimmed inset (CSS px) on top of the viewBox offset.
 * 0 — the edge gap is `geometry.offset` only (offsetScale), not a second band.
 */
export const MINIMAP_MASK_MIN_CSS_PX = 0

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
 * Evenodd hole = camera clipped to the painted map.
 * Miss → null (no hole, all dimmed). Do not punch the whole widget — that jumped
 * the mask when the furthest object left the screen.
 */
export function minimapViewportMaskRect(
  viewBB: MinimapFlowRect,
  frame: MinimapFlowRect, // Painted minimap world (geometry x/y/width/height)
  viewScale: number, // Flow units per CSS px on the minimap
  minMaskCssPx = MINIMAP_MASK_MIN_CSS_PX
): MinimapFlowRect | null {
  const pad = minMaskCssPx * Math.max(viewScale, 1e-6) // Flow inset that must stay dimmed
  const inner: MinimapFlowRect = {
    x: frame.x + pad,
    y: frame.y + pad,
    width: Math.max(0, frame.width - pad * 2),
    height: Math.max(0, frame.height - pad * 2),
  }
  return rectIntersection(viewBB, inner) // Overlap only — full contain already returns `inner`
}

/** Largest same-center rect with this width/height ratio that fits in `box`. */
export function fitAspectInRect(box: MinimapFlowRect, aspect: number): MinimapFlowRect {
  if (!(aspect > 0) || box.width <= 0 || box.height <= 0) return box
  const boxAspect = box.width / box.height
  if (boxAspect > aspect) {
    const width = box.height * aspect // Box is wider — dim the sides
    return { x: box.x + (box.width - width) / 2, y: box.y, width, height: box.height }
  }
  const height = box.width / aspect // Box is taller — dim the top/bottom
  return { x: box.x, y: box.y + (box.height - height) / 2, width: box.width, height }
}

/** ViewBox minus its offset — the hole stays this far from the widget edge. */
export function minimapMaskClipRect(geometry: {
  x: number
  y: number
  width: number
  height: number
  offset: number
}): MinimapFlowRect {
  const pad = geometry.offset // Same air computeMinimapGeometry added around the fit
  return {
    x: geometry.x + pad,
    y: geometry.y + pad,
    width: Math.max(0, geometry.width - pad * 2),
    height: Math.max(0, geometry.height - pad * 2),
  }
}

/**
 * World rect the minimap frames against = nodes currently in the camera, with air
 * so marks are not flush to the widget. Empty view falls back to the camera.
 */
export function minimapBoundingRect(
  content: MinimapFlowRect | null,
  view: MinimapFlowRect
): MinimapFlowRect {
  if (!content || content.width <= 0 || content.height <= 0) return view // Nothing measured — show the camera
  const padX = Math.max(12, content.width * 0.06) // Slight air so a frame on the edge is not clipped
  const padY = Math.max(12, content.height * 0.06)
  return {
    x: content.x - padX,
    y: content.y - padY,
    width: content.width + padX * 2,
    height: content.height + padY * 2,
  }
}

/** Union two AABBs. Nulls drop out. */
export function unionFlowRects(
  a: MinimapFlowRect | null,
  b: MinimapFlowRect | null
): MinimapFlowRect | null {
  if (!a) return b
  if (!b) return a
  const x = Math.min(a.x, b.x)
  const y = Math.min(a.y, b.y)
  const right = Math.max(a.x + a.width, b.x + b.width)
  const bottom = Math.max(a.y + a.height, b.y + b.height)
  return { x, y, width: right - x, height: bottom - y }
}

/**
 * Keep the last in-view frame while board zoom is unchanged.
 * Panning the furthest object off-screen used to fall back to the camera and snap
 * the widget to a huge empty board; the object should stay under the mask instead.
 * A zoom change resets so on-screen marks still fill the widget.
 */
export function stickMinimapFrame(
  visible: MinimapFlowRect | null,
  boardZoom: number,
  prev: { zoom: number; frame: MinimapFlowRect | null }
): { zoom: number; frame: MinimapFlowRect | null } {
  const zoomChanged = !(prev.zoom > 0) || Math.abs(prev.zoom - boardZoom) > 1e-6
  if (zoomChanged) return { zoom: boardZoom, frame: visible } // New camera scale — reframe
  return { zoom: boardZoom, frame: unionFlowRects(prev.frame, visible) } // Pan: keep / grow, never drop to camera
}

/** AABB of the on-screen part of each node. Null when nothing intersects the camera. */
export function minimapNodesInViewBounds(
  nodes: MinimapFlowRect[],
  view: MinimapFlowRect
): MinimapFlowRect | null {
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  let any = false
  for (const node of nodes) {
    if (node.width <= 0 || node.height <= 0) continue
    const hit = rectIntersection(node, view) // Visible slice only — a huge off-screen frame must not shrink the rest
    if (!hit) continue
    any = true
    minX = Math.min(minX, hit.x)
    minY = Math.min(minY, hit.y)
    maxX = Math.max(maxX, hit.x + hit.width)
    maxY = Math.max(maxY, hit.y + hit.height)
  }
  if (!any) return null
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY }
}

/**
 * Full minimap SVG geometry (viewBox + mask), shared by board + preview minimaps.
 *
 * Frames nodes in the current camera so those marks fill the widget. Scope 1 fits
 * that box; the mask hole is the camera clipped to the viewBox inset (edge gap).
 */
export function computeMinimapGeometry(
  viewBB: MinimapFlowRect,
  content: MinimapFlowRect | null,
  elementWidth: number,
  elementHeight: number,
  offsetScale = 5,
  scopeZoom = 1 // 1 = framing fit; >1 closer look; <1 more padding — not board zoom
) {
  const boundingRect = minimapBoundingRect(content, viewBB) // Nodes on screen, else the camera
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
  // Center on the framed nodes so the camera hole moves across them as you pan
  const anchorX = boundingRect.x + boundingRect.width / 2
  const anchorY = boundingRect.y + boundingRect.height / 2
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
