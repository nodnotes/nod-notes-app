import { Position, useStore, type Node } from 'reactflow' // Snap target + frame boxes
import {
  arrowTipOutsideFrame,
  boardTipArrivalSide,
  clampArrowHead,
  getBoardTipBezier,
  getSmoothThreadBezier,
  threadArrowLength,
} from './path/bezier' // Board free end + frame-side arrow, sized with the stroke
import {
  routeThreadAroundFrames,
  smoothSpreadClear,
  snapshotFrameObstacles,
  type FrameObstacle,
} from '@/lib/threads/avoid-frames' // Preview steps around frames the thread is not aiming at
import { snapshotThreadCorridors, spreadAlongside } from '@/lib/threads/separate-threads' // Preview takes a free lane beside settled threads
import { connectionPointOnNode, sideFromHandleId } from './connection-point-on-node' // Snapped side + silhouette attach
import {
  closestClearConnection,
  nodeUnderFillPointer,
} from '@/lib/threads/closest-connection' // Frame drop follows the closest sides that stay outside the fill
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
    const sides = [Position.Left, Position.Right, Position.Top, Position.Bottom]
    for (const side of sides) {
      const at = connectionPointOnNode(n, side) // Same point the settled stroke uses (on the silhouette)
      const sx = at?.x ?? (side === Position.Right ? nx + w : side === Position.Left ? nx : nx + w / 2)
      const sy = at?.y ?? (side === Position.Bottom ? ny + h : side === Position.Top ? ny : ny + h / 2)
      const d = (sx - x) * (sx - x) + (sy - y) * (sy - y) // Distance to this connection point
      if (d < best) {
        best = d // Keep the closer point
        bestSide = side
      }
    }
  }
  return bestSide
}

/** Frame the pointer is aiming at, so the preview does not route around the frame it is about to join. */
function frameIdNear(
  boxes: FrameObstacle[], // Measured frames
  sourceId: string | null, // Frame the drag started on
  x: number, // Pointer X
  y: number // Pointer Y
): string | null {
  let best: string | null = null // Nearest frame in the aim band
  let bestD = Infinity // Distance to that frame's center
  for (const o of boxes) {
    if (o.id === sourceId) continue // Never the source
    if (x < o.x - FRAME_AIM_PAD || x > o.x + o.w + FRAME_AIM_PAD) continue // Outside the horizontal band
    if (y < o.y - FRAME_AIM_PAD || y > o.y + o.h + FRAME_AIM_PAD) continue // Outside the vertical band
    const d = (o.x + o.w / 2 - x) ** 2 + (o.y + o.h / 2 - y) ** 2 // Closer center wins
    if (d < bestD) {
      bestD = d
      best = o.id
    }
  }
  return best
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
  // Over the frame fill (not a simulated connection point) the preview jumps to the closest clear sides.
  const floatEnds = useStore((s) => {
    if (!s.connectionNodeId || s.connectionStatus === 'valid') return null // A snapped point stays pinned
    const zoom = s.transform[2] || 1 // Board zoom
    const x = (s.connectionPosition.x - s.transform[0]) / zoom // Pointer X in flow space
    const y = (s.connectionPosition.y - s.transform[1]) / zoom // Pointer Y in flow space
    const source = s.nodeInternals.get(s.connectionNodeId) // Frame the drag started on
    const target = source ? nodeUnderFillPointer(s.nodeInternals.values(), s.connectionNodeId, x, y) : null // Fill under the pointer
    if (!source || !target) return null // Adjust box and empty board keep the pointer end
    const pair = closestClearConnection(source, target) // Sides that do not cross either fill
    if (!pair) return null // Unmeasured — stay on the pointer
    const fromSide = sideFromHandleId(pair.sourceHandle, undefined) // Side the thread should leave
    const toSide = sideFromHandleId(pair.targetHandle, undefined) // Side the thread should arrive
    const from = connectionPointOnNode(source, fromSide) // Start on that connection point
    const to = connectionPointOnNode(target, toSide) // End on that connection point
    if (!from || !to || !fromSide || !toSide) return null // Missing anchor
    return { fromX: from.x, fromY: from.y, toX: to.x, toY: to.y, fromSide, toSide, targetId: target.id }
  })
  const sx = floatEnds?.fromX ?? fromX // Closest source point, or the point the drag started on
  const sy = floatEnds?.fromY ?? fromY
  const tx = floatEnds?.toX ?? toX // Closest target point, or the pointer / snapped point
  const ty = floatEnds?.toY ?? toY
  const leave = floatEnds?.fromSide ?? fromPosition // Side the preview leaves
  const zoom = useStore((s) => s.transform[2] || 1) // Board zoom — preview head tracks the stroke
  const previewUser = 2 * threadInvZoom(zoom) // Matches `--tt-edge-w: 2` times the same inv-zoom as settled threads
  const previewSpan = Math.hypot(tx - sx, ty - sy) || 1 // Drag length along the path actually drawn
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
  const boxes = useStore((s) => snapshotFrameObstacles(s.nodeInternals)) // Frames the preview should step around
  const sourceId = useStore((s) => s.connectionNodeId) // Frame the drag started on
  const snapId = useStore((s) =>
    s.connectionStatus === 'valid' ? s.connectionEndHandle?.nodeId ?? null : null
  ) // Snapped frame, when the pointer is on a connection point
  const aimedId = floatEnds?.targetId ?? snapId ?? frameIdNear(boxes, sourceId, tx, ty) // Don't route around the frame being joined
  const arrival = floatEnds?.toSide ?? frameSide ?? boardTipArrivalSide(tx - sx, ty - sy) // Free end arrives traveling away
  const onFrame = Boolean(floatEnds || snapId) // Tip is a frame connection point, not the empty board
  const frameTip = onFrame ? arrowTipOutsideFrame({ x: tx, y: ty }, arrival, head, previewSpan) : null // Whole head sits outside the fill
  const tipX = frameTip?.x ?? tx // Preview arrow lands here
  const tipY = frameTip?.y ?? ty
  const settled = useStore((s) => snapshotThreadCorridors(s.nodeInternals, s.edges)) // Threads already on the board
  const previewSpread = spreadAlongside(
    { id: '__preview__', source: { x: sx, y: sy }, target: { x: tx, y: ty } }, // This drag's chord
    settled
  ) // A free lane beside those strokes
  const detour = routeThreadAroundFrames({
    source: { x: sx, y: sy }, // Connection point the drag leaves
    target: { x: tipX, y: tipY }, // Outside the fill when the tip meets a frame
    fromSide: leave, // Leave along that side
    toSide: arrival, // Into the aimed side, or away across empty board
    sourceId: sourceId ?? '', // Not an obstacle
    targetId: aimedId ?? '', // The frame under the pointer is the destination, not an obstacle
    obstacles: boxes, // Every other frame
    head, // Stroke meets the back of the preview arrow
    shape:
      algorithm === ThreadAlgorithm.Orthogonal
        ? 'sharp'
        : algorithm === ThreadAlgorithm.Linear
          ? 'linear' // Straight line — do not route around other frames
          : 'smooth',
    sampleSmooth: algorithm !== ThreadAlgorithm.Linear && algorithm !== ThreadAlgorithm.Orthogonal,
    fan: previewSpread.rank * previewSpread.sep, // Detour sits past the threads already in this lane
  })

  const direct =
    algorithm === ThreadAlgorithm.Linear
      ? getBoardTipBezier({
          sourceX: sx, // Connection point the drag leaves
          sourceY: sy,
          sourcePosition: leave, // Unused by the straight ray; kept for the shared helper
          targetX: tipX, // Outside the fill when the tip meets a frame
          targetY: tipY,
          algorithm, // Straight line — other frames stay in the way
          head, // Stroke meets the back of the preview arrow
        })
      : arrival && (floatEnds || frameSide)
        ? getSmoothThreadBezier({
            sourceX: sx, // Connection point the drag leaves
            sourceY: sy,
            sourcePosition: leave, // Leave along that side
            targetX: tipX, // Outside the fill when the tip meets a frame
            targetY: tipY,
            targetPosition: arrival, // Left side → arrow points right
            head, // Stroke meets the back of the preview arrow
          })
        : getBoardTipBezier({
            sourceX: sx, // Empty board — connection point is the center
            sourceY: sy,
            sourcePosition: leave, // Leave outward along that side
            targetX: tipX, // Pointer, or just outside the fill
            targetY: tipY,
            algorithm, // Smooth curve, sharp elbows, or a straight ray
            head, // Stroke meets the back of the preview arrow
          })
  const path = detour
    ? detour.path // Around frames this drag is not joining
    : smoothSpreadClear(direct, previewSpread, boxes, sourceId ?? '', aimedId ?? '').path // Free lane beside other threads

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
