import { getBoundsOfRects } from '@reactflow/core'

/** Flow-space AABB used by minimap viewBox math. */
export type MinimapFlowRect = {
  x: number
  y: number
  width: number
  height: number
}

/**
 * World rect the minimap frames against.
 *
 * RF MiniMap always unions content ∪ viewport. That shrinks frame blocks once the
 * viewport grows past content (“view box hits the walls”), but locks scale to all
 * content when zooming in — frames never expand again.
 *
 * Symmetry: when content is larger than the viewport in either axis, frame by the
 * viewport so zoom-in expands blocks; when the viewport contains content, keep the
 * union so further zoom-out still shrinks them.
 */
export function minimapBoundingRect(
  content: MinimapFlowRect | null,
  view: MinimapFlowRect
): MinimapFlowRect {
  if (!content || content.width <= 0 || content.height <= 0) return view
  // Zoomed in past content-fit — follow the camera so frame blocks grow
  if (content.width > view.width || content.height > view.height) {
    return view
  }
  // Zoomed out to/past fit — union grows with the view (frames shrink past the walls)
  return getBoundsOfRects(content, view)
}

/** Full minimap SVG geometry (viewBox + mask), shared by board + preview minimaps. */
export function computeMinimapGeometry(
  viewBB: MinimapFlowRect,
  content: MinimapFlowRect | null,
  elementWidth: number,
  elementHeight: number,
  offsetScale = 5
) {
  const boundingRect = minimapBoundingRect(content, viewBB)
  const scaledWidth = boundingRect.width / elementWidth
  const scaledHeight = boundingRect.height / elementHeight
  const viewScale = Math.max(scaledWidth, scaledHeight)
  const viewWidth = viewScale * elementWidth
  const viewHeight = viewScale * elementHeight
  const offset = offsetScale * viewScale
  const x = boundingRect.x - (viewWidth - boundingRect.width) / 2 - offset
  const y = boundingRect.y - (viewHeight - boundingRect.height) / 2 - offset
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
