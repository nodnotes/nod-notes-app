import { getBoundsOfRects } from '@reactflow/core'

/** Flow-space AABB used by minimap viewBox math. */
export type MinimapFlowRect = {
  x: number
  y: number
  width: number
  height: number
}

/** Independent of board camera — 1 fits content; higher zooms into the map. */
export const MINIMAP_SCOPE_ZOOM = { min: 0.25, max: 8 } as const

/**
 * Minimum dimmed “out of view” band on each side of the minimap (CSS px).
 * When the board is zoomed out the true viewport can fill the SVG — clamp the hole
 * so this mask always remains visible.
 */
export const MINIMAP_MASK_MIN_CSS_PX = 8

/** Keep scope zoom inside the scrub band. */
export function clampMinimapScopeZoom(z: number) {
  return Math.max(MINIMAP_SCOPE_ZOOM.min, Math.min(MINIMAP_SCOPE_ZOOM.max, z))
}

/**
 * Evenodd hole for the out-of-view mask.
 * Uses the true camera when it leaves room for the dimmed band; when the viewport
 * would swallow the minimap, shrinks the hole (centered on the camera) so at least
 * `minMaskCssPx` of mask stays on each side at every board zoom / nav.
 */
export function minimapViewportMaskRect(
  viewBB: MinimapFlowRect,
  frame: MinimapFlowRect, // Painted minimap world (geometry x/y/width/height)
  viewScale: number, // Flow units per CSS px on the minimap
  minMaskCssPx = MINIMAP_MASK_MIN_CSS_PX
): MinimapFlowRect {
  const pad = minMaskCssPx * Math.max(viewScale, 1e-6) // Flow inset that must stay dimmed
  const maxW = Math.max(0, frame.width - pad * 2)
  const maxH = Math.max(0, frame.height - pad * 2)
  const width = Math.min(viewBB.width, maxW) // Never larger than the inset frame
  const height = Math.min(viewBB.height, maxH)
  const cx = viewBB.x + viewBB.width / 2
  const cy = viewBB.y + viewBB.height / 2
  // Keep the hole on-camera, then clamp inside the frame inset so the mask band is even
  let x = cx - width / 2
  let y = cy - height / 2
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
 * World rect the minimap frames against.
 *
 * When the camera is zoomed in past content-fit, frame by the viewport so nodes pan
 * with the board. When zoomed out, union content ∪ view so frames stay on the map
 * and the out-of-view mask can still show a min band. Empty boards use the camera.
 */
export function minimapBoundingRect(
  content: MinimapFlowRect | null,
  view: MinimapFlowRect
): MinimapFlowRect {
  if (!content || content.width <= 0 || content.height <= 0) return view
  // Zoomed in past content-fit — follow the camera so nodes pan / grow with zoom
  if (content.width > view.width || content.height > view.height) {
    return view
  }
  // Zoomed out to/past fit — union grows with the view
  return getBoundsOfRects(content, view)
}

/**
 * Full minimap SVG geometry (viewBox + mask), shared by board + preview minimaps.
 *
 * `scopeCenter` anchors independent minimap scope zoom. Pass the live viewport center
 * so nodes keep panning with the board; freeze it only for the duration of a minimap
 * drag (CSS→flow math must not chase the camera mid-gesture).
 */
export function computeMinimapGeometry(
  viewBB: MinimapFlowRect,
  content: MinimapFlowRect | null,
  elementWidth: number,
  elementHeight: number,
  offsetScale = 5,
  scopeZoom = 1, // 1 = framing fit; >1 closer look; <1 more padding — not board zoom
  scopeCenter: { x: number; y: number } | null = null // Anchor while scopeZoom > 1 (live or drag-frozen)
) {
  const boundingRect = minimapBoundingRect(content, viewBB)
  const scaledWidth = boundingRect.width / elementWidth
  const scaledHeight = boundingRect.height / elementHeight
  const fitScale = Math.max(scaledWidth, scaledHeight) // Flow units per CSS px at framing fit
  const safeScope = Math.max(scopeZoom, 1e-6) // Avoid divide-by-zero from a bad scrub
  const viewScale = fitScale / safeScope // Higher scope → smaller viewBox → frames look larger
  const viewWidth = viewScale * elementWidth
  const viewHeight = viewScale * elementHeight
  const offset = offsetScale * viewScale
  // Scope zoom: follow caller center (usually the camera). Else center the framed world.
  const anchorX =
    safeScope > 1 && scopeCenter
      ? scopeCenter.x
      : boundingRect.x + boundingRect.width / 2
  const anchorY =
    safeScope > 1 && scopeCenter
      ? scopeCenter.y
      : boundingRect.y + boundingRect.height / 2
  const x = anchorX - viewWidth / 2 - offset
  const y = anchorY - viewHeight / 2 - offset
  const width = viewWidth + offset * 2
  const height = viewHeight + offset * 2
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
