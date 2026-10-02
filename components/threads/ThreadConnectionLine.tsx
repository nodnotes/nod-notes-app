import { Position, useStore, type Node } from 'reactflow' // Snap target + frame boxes
import {
  clampArrowHead,
  getBoardTipBezier,
  getFrameConnectPreview,
  threadArrowLength,
} from './path/bezier' // Board free end + frame-side arrow, sized with the stroke
import { sideFromHandleId } from './connection-point-on-node' // Snapped connection-point side
import { threadAlgorithmFromStyle, threadInvZoom, ThreadAlgorithm } from './constants' // Toolbar style + zoom weight

/** Flow px around a frame where the preview arrow takes that frame's connection direction. */
const FRAME_AIM_PAD = 48

/** Closest side of a frame under the pointer, excluding the frame the drag started on. */
function nearestFrameSide(
  nodes: Map<string, Node>, // Live RF nodes
  sourceId: string | null, // Frame the thread is leaving
  x: number, // Pointer X in flow space
  y: number // Pointer Y in flow space
): Position | null {
  let bestSide: Position | null = null // Winning side
  let best = Infinity // Squared distance to that side's connection point
  for (const n of nodes.values()) {
    if (n.id === sourceId || n.type === 'threadTip') continue // Not the source, not a board tip
    const nx = n.positionAbsolute?.x ?? n.position.x // Frame origin X
    const ny = n.positionAbsolute?.y ?? n.position.y // Frame origin Y
    const w = n.width ?? 0 // Frame width
    const h = n.height ?? 0 // Frame height
    if (w < 2 || h < 2) continue // Not measured yet
    if (x < nx - FRAME_AIM_PAD || x > nx + w + FRAME_AIM_PAD) continue // Outside the horizontal aim band
    if (y < ny - FRAME_AIM_PAD || y > ny + h + FRAME_AIM_PAD) continue // Outside the vertical aim band
    const sides: Array<[Position, number, number]> = [
      [Position.Left, nx, ny + h / 2], // Left connection point
      [Position.Right, nx + w, ny + h / 2], // Right connection point
      [Position.Top, nx + w / 2, ny], // Top connection point
      [Position.Bottom, nx + w / 2, ny + h], // Bottom connection point
    ]
    for (const [side, sx, sy] of sides) {
      const d = (sx - x) * (sx - x) + (sy - y) * (sy - y) // Distance to this connection point
      if (d < best) {
        best = d // Keep the closer point
        bestSide = side
      }
    }
  }
  return bestSide
}

/** Read board thread style preference for the live connection preview. */
function preferredAlgorithm() {
  if (typeof window === 'undefined') return ThreadAlgorithm.BezierCatmullRom
  return threadAlgorithmFromStyle(
    localStorage.getItem('nodnotes-horizontal-line-style')
  )
}

/**
 * Connection-line preview while creating or reconnecting a thread.
 * Miro-like: side-aware cubic bezier (or sharp/linear) — no stub waypoints / S-curves.
 * Over a frame, the arrow faces that side's connection direction (left points right).
 * Stroke thickness is view-relative via CSS `--tt-board-zoom` (not React zoom).
 */
export function ThreadConnectionLine({
  fromX,
  fromY,
  toX,
  toY,
  fromPosition = Position.Right,
}: {
  fromX: number
  fromY: number
  toX: number
  toY: number
  fromPosition?: Position
}) {
  const algorithm = preferredAlgorithm()
  const zoom = useStore((s) => s.transform[2] || 1) // Board zoom — preview head tracks the stroke
  const previewUser = 2 * threadInvZoom(zoom) // Matches `--tt-edge-w: 2` times the same inv-zoom as settled threads
  const previewSpan = Math.hypot(toX - fromX, toY - fromY) || 1 // Drag length
  const head = clampArrowHead(threadArrowLength(previewUser), previewSpan) // Stroke stops short of the tip
  // Snapped side wins; otherwise the closest side of the frame under the pointer.
  const frameSide = useStore((s) => {
    if (!s.connectionNodeId) return null // Not dragging a thread
    if (s.connectionStatus === 'valid') {
      return sideFromHandleId(s.connectionEndHandle?.handleId, undefined) ?? null // Exact snapped side
    }
    const zoom = s.transform[2] || 1 // Board zoom
    const x = (s.connectionPosition.x - s.transform[0]) / zoom // Pointer X in flow space
    const y = (s.connectionPosition.y - s.transform[1]) / zoom // Pointer Y in flow space
    return nearestFrameSide(s.nodeInternals, s.connectionNodeId, x, y)
  })
  const stroke = '#b1b1b7' // CSS forces the preview stroke to this gray

  const path = frameSide
    ? getFrameConnectPreview({
        sourceX: fromX, // Connection point the drag started on
        sourceY: fromY,
        sourcePosition: fromPosition, // Leave along that side
        targetX: toX, // Pointer or snapped point
        targetY: toY,
        targetSide: frameSide, // Left side → arrow points right
        head, // Stroke meets the back of the preview arrow
      })
    : getBoardTipBezier({
        sourceX: fromX, // Empty board — connection point is the center
        sourceY: fromY,
        sourcePosition: fromPosition, // Leave outward along that side
        targetX: toX, // Pointer
        targetY: toY,
        algorithm, // Smooth curve, sharp elbows, or a straight ray
        head, // Stroke meets the back of the preview arrow
      }).path

  return (
    <g className="react-flow__connectionline">
      <defs>
        <marker
          id="tt-board-drag-arrow" // One preview arrow; this SVG is not the settled-edge SVG
          className="react-flow__arrowhead"
          markerWidth={head * 4} // Same length as the stroke inset, in flow px
          markerHeight={head * 4} // Square box so the head stays proportional to the stroke
          viewBox="-10 -10 20 20"
          markerUnits="userSpaceOnUse" // Flow px, divided by zoom like the stroke
          orient="auto-start-reverse" // Tip follows the end tangent
          refX="-5" // Back of the head sits on the stroke end
          refY="0"
        >
          <polyline
            points="-5,-4 0,0 -5,4 -5,-4" // Closed arrow, same as a settled thread
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{ stroke, fill: stroke, strokeWidth: 1 }}
          />
        </marker>
      </defs>
      <path
        d={path}
        fill="none"
        className="react-flow__connectionline-path"
        stroke={stroke}
        markerEnd="url(#tt-board-drag-arrow)" // Arrow while dragging, including onto another frame
        style={{ ['--tt-edge-w' as string]: 2 }} // CSS divides by live board zoom
      />
    </g>
  )
}
