import { zoomIdentity } from 'd3-zoom'
import type { ReactFlowState } from '@reactflow/core'

/** Move the camera so view origin (flow) sits at the top-left of the pane. */
export function panViewportToFlowOrigin(
  state: ReactFlowState,
  viewX: number, // Flow X that should meet the pane's left edge
  viewY: number, // Flow Y that should meet the pane's top edge
  zoom = state.transform[2] // Caller passes the zoom from pointer-down so a drag cannot rescale
): void {
  const { d3Selection, d3Zoom, translateExtent, width, height } = state
  if (!d3Selection || !d3Zoom) return
  const next = zoomIdentity.translate(-viewX * zoom, -viewY * zoom).scale(zoom)
  const extent: [[number, number], [number, number]] = [
    [0, 0],
    [width, height],
  ]
  d3Zoom.transform(d3Selection, d3Zoom.constrain()(next, extent, translateExtent))
}
