import { getSmoothStepPath, Position } from 'reactflow' // Sharp preview path
import { getSmoothThreadBezier } from './path/bezier' // Same bowed Smooth path as settled threads
import {
  isSharpThreadAlgorithm,
  threadAlgorithmFromStyle,
  ThreadAlgorithm,
} from './constants' // Toolbar Smooth / Sharp / Linear

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
 * Uses RF `toPosition` so a top snap approaches from above.
 * Stroke thickness is view-relative via CSS `--tt-board-zoom` (not React zoom).
 */
export function ThreadConnectionLine({
  fromX,
  fromY,
  toX,
  toY,
  fromPosition = Position.Right,
  toPosition = Position.Left,
}: {
  fromX: number
  fromY: number
  toX: number
  toY: number
  fromPosition?: Position
  toPosition?: Position // Target handle side when snapped
}) {
  const algorithm = preferredAlgorithm()

  let path: string
  if (isSharpThreadAlgorithm(algorithm)) {
    ;[path] = getSmoothStepPath({
      sourceX: fromX,
      sourceY: fromY,
      sourcePosition: fromPosition,
      targetX: toX,
      targetY: toY,
      targetPosition: toPosition,
      borderRadius: 8,
    })
  } else if (algorithm === ThreadAlgorithm.Linear) {
    path = `M ${fromX} ${fromY} L ${toX} ${toY}`
  } else {
    path = getSmoothThreadBezier({
      sourceX: fromX, // Live drag start (already on the source connection point)
      sourceY: fromY,
      sourcePosition: fromPosition, // Side we left — top↔top while snapping beside a mate
      targetX: toX,
      targetY: toY,
      targetPosition: toPosition, // RF toPosition so a top snap approaches from above
    }).path
  }

  return (
    <g className="react-flow__connectionline">
      <path
        d={path}
        fill="none"
        className="react-flow__connectionline-path"
        stroke="#6b7280"
        style={{ ['--tt-edge-w' as string]: 2 }} // CSS divides by live board zoom
      />
    </g>
  )
}
