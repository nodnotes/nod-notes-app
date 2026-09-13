import { useCallback, useEffect, useRef } from 'react' // Stable setters + sanitize indicator handle ids
import {
  BaseEdge,
  EdgeProps,
  Edge,
  useReactFlow,
  useStore,
  Position,
  type XYPosition,
  type Node as RFNode,
} from 'reactflow' // Custom edge primitives + selection store

import { ControlPoint, type ControlPointData } from './ControlPoint' // Miro-style path knobs
import { isBoardNavigating } from '@/lib/board-navigating' // Skip O(n) on-thread scans mid pan/zoom
import { isFrameDragging } from '@/lib/frame-dragging' // Skip O(n) on-thread scans mid frame drag
import { getPath, getControlPoints } from './path' // Path math when user has bent the thread
import { getSmoothThreadBezier } from './path/bezier' // Same-side bow for unbent Smooth (snapped frames)
import {
  DEFAULT_THREAD_ALGORITHM,
  THREAD_DEFAULT_COLOR,
  THREAD_DEFAULT_STROKE_WIDTH,
  THREAD_SELECTED_COLOR,
  ThreadAlgorithm,
  threadStrokeWidthForFrames,
} from './constants' // Stroke + algorithm defaults + frame-size thickness
import { normalizeHandleId } from './handle-ids' // Strip -indicator from stored handle ids
import {
  connectionPointOnNode,
  sideFromHandleId,
} from './connection-point-on-node' // Frame-edge attach from node box
import { onThreadFrameVisualSize, readOnThread, isOnThreadInline, ON_THREAD_DOT_R, ON_THREAD_PERP_THRESHOLD } from '@/lib/threads/on-thread-frame'
import {
  buildThreadPathGeometry,
  threadGapsForFrames,
  threadStrokePaths,
} from '@/lib/threads/thread-path-geometry'

/** Persistable thread payload stored in panel_edges.metadata + edge.data. */
export type ThreadEdgeData = {
  algorithm?: ThreadAlgorithm // Path math (default BezierCatmullRom)
  points?: ControlPointData[] // Active control points between source and target
  dotted?: boolean // Optional dashed stroke (View toolbar)
  strokeWidth?: number // Thickness in flow px (1–4 from thread menu; default 2)
  strokeColor?: string // Idle stroke hex; empty/omit = THREAD_DEFAULT_COLOR
}

export type ThreadEdge = Edge<ThreadEdgeData>

/** Assign stable ids to inactive mid-points so React keys survive rerenders. */
const useIdsForInactiveControlPoints = (points: ControlPointData[]) => {
  const ids = useRef<string[]>([]) // Cached ids for the current inactive count

  if (ids.current.length === points.length) {
    return points.map((point, i) =>
      point.id ? point : { ...point, id: ids.current[i] }
    )
  }

  ids.current = []
  return points.map((point, i) => {
    if (!point.id) {
      const id =
        typeof crypto !== 'undefined' && crypto.randomUUID
          ? crypto.randomUUID()
          : `cp-${i}-${Math.random().toString(36).slice(2)}`
      ids.current[i] = id
      return { ...point, id }
    }
    ids.current[i] = point.id
    return point
  })
}

type EditableThreadProps = EdgeProps<ThreadEdgeData>

/** Flow box of a frame node — prefer RF measure, then style, then saved resize box. */
function nodeFlowSize(n?: RFNode | null): { width: number; height: number } {
  if (!n) return { width: 80, height: 40 } // Neutral mid size when a side is missing
  const measured = (n as RFNode & { measured?: { width?: number; height?: number } }).measured
  const rawW = n.width ?? measured?.width ?? n.style?.width
  const rawH = n.height ?? measured?.height ?? n.style?.height
  let w = typeof rawW === 'number' ? rawW : parseFloat(String(rawW ?? ''))
  let h = typeof rawH === 'number' ? rawH : parseFloat(String(rawH ?? ''))
  // Hug / max-content frames sometimes lack numeric RF size — use persisted box × frameScale
  if (!(Number.isFinite(w) && w > 0 && Number.isFinite(h) && h > 0)) {
    const meta = (n.data as { promptMessage?: { metadata?: Record<string, unknown> } } | undefined)
      ?.promptMessage?.metadata
    const dims = meta?.resizeDimensions as { width?: number; height?: number } | undefined
    const fs =
      typeof meta?.frameScale === 'number' && Number.isFinite(meta.frameScale)
        ? Math.max(0.15, meta.frameScale as number)
        : 1
    if (dims && typeof dims.width === 'number' && typeof dims.height === 'number') {
      w = dims.width * fs
      h = dims.height * fs
    }
  }
  return {
    width: Number.isFinite(w) && w > 0 ? w : 80,
    height: Number.isFinite(h) && h > 0 ? h : 40,
  }
}

/**
 * Miro-style editable thread.
 * Endpoints always come from the node frame edge (connection point) — never from outer indicators.
 */
export function EditableThread({
  id,
  selected,
  source,
  target,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  sourceHandleId,
  targetHandleId,
  markerEnd,
  markerStart,
  style,
  data,
}: EditableThreadProps) {
  const algorithm = data?.algorithm ?? DEFAULT_THREAD_ALGORITHM
  const points = data?.points ?? []
  const dotted = data?.dotted === true
  const strokeWidth = data?.strokeWidth ?? THREAD_DEFAULT_STROKE_WIDTH // Menu thickness (1–4px)
  const { setEdges } = useReactFlow()

  // Live node boxes — path attaches here even if RF's handle coords are still on an indicator
  const sourceNode = useStore((s) => s.nodeInternals.get(source))
  const targetNode = useStore((s) => s.nodeInternals.get(target))

  const sourceSide = sideFromHandleId(sourceHandleId, sourcePosition)
  const targetSide = sideFromHandleId(targetHandleId, targetPosition)

  const sourceOrigin: XYPosition =
    connectionPointOnNode(sourceNode, sourceSide) ?? { x: sourceX, y: sourceY }
  const targetOrigin: XYPosition =
    connectionPointOnNode(targetNode, targetSide) ?? { x: targetX, y: targetY }

  // Persist edge-anchor handle ids (strip *-indicator) so RF also prefers edge handles
  useEffect(() => {
    const nextSource = normalizeHandleId(sourceHandleId)
    const nextTarget = normalizeHandleId(targetHandleId)
    if (nextSource === sourceHandleId && nextTarget === targetHandleId) return
    setEdges((edges) =>
      edges.map((e) =>
        e.id !== id
          ? e
          : {
              ...e,
              sourceHandle: normalizeHandleId(e.sourceHandle) ?? e.sourceHandle,
              targetHandle: normalizeHandleId(e.targetHandle) ?? e.targetHandle,
            }
      )
    )
  }, [id, sourceHandleId, targetHandleId, setEdges])

  const shouldShowPoints = useStore((store) => {
    const src = store.nodeInternals.get(source)
    const tgt = store.nodeInternals.get(target)
    return Boolean(selected || src?.selected || tgt?.selected)
  })

  const isConnecting = useStore((s) => !!s.connectionNodeId)

  const setControlPoints = useCallback(
    (update: (pts: ControlPointData[]) => ControlPointData[]) => {
      setEdges((edges) =>
        edges.map((e) => {
          if (e.id !== id) return e
          const prev = (e.data as ThreadEdgeData | undefined)?.points ?? []
          return {
            ...e,
            data: {
              ...(e.data as ThreadEdgeData | undefined),
              algorithm,
              points: update(prev),
            },
          }
        })
      )
    },
    [setEdges, id, algorithm]
  )

  const fromSide = sourceSide ?? Position.Right
  const toSide = targetSide ?? Position.Left
  const sides = { fromSide, toSide }

  // Route for editable knobs (user bends). Unbent Smooth uses getSmoothThreadBezier below —
  // Catmull stubs added S-curves; RF getBezierPath went flat on same-side snapped frames.
  const routePoints = [sourceOrigin, ...points, targetOrigin]
  const unbentSmooth =
    points.length === 0 &&
    (algorithm === ThreadAlgorithm.BezierCatmullRom ||
      algorithm === ThreadAlgorithm.CatmullRom)
  const smoothBezier = unbentSmooth
    ? getSmoothThreadBezier({
        sourceX: sourceOrigin.x, // Frame-edge attach, not the outer indicator
        sourceY: sourceOrigin.y,
        sourcePosition: fromSide, // Snapped side (top↔top when frames sit left/right)
        targetX: targetOrigin.x,
        targetY: targetOrigin.y,
        targetPosition: toSide,
      })
    : null
  const controlPoints = unbentSmooth
    ? [{ id: '', active: false, x: smoothBezier!.mid.x, y: smoothBezier!.mid.y }] // Hollow knob on the arch, not the chord
    : getControlPoints({
        points: routePoints,
        algorithm,
        sides,
      })
  const controlPointsWithIds = useIdsForInactiveControlPoints(controlPoints)

  // Unbent Smooth → bowed cubic (same-side) / RF bezier (opposite). Bent / Sharp / Linear → waypoints.
  const path = smoothBezier
    ? smoothBezier.path
    : getPath({ points: routePoints, algorithm, sides })

  const pathGeom =
    typeof document !== 'undefined'
      ? buildThreadPathGeometry({
          edge: { id, source, target, data, sourceHandle: sourceHandleId, targetHandle: targetHandleId },
          sourceNode,
          targetNode,
          sourceX,
          sourceY,
          targetX,
          targetY,
          sourcePosition,
          targetPosition,
          sourceHandleId,
          targetHandleId,
        })
      : null

  // Inline frames break the stroke; offset frames show a dot on the path instead.
  const { inlineGaps, threadDots } = useStore((s) => {
    const gaps: Array<{ t: number; width: number; height: number }> = []
    const dots: XYPosition[] = []
    if (isBoardNavigating() || isFrameDragging()) return { inlineGaps: gaps, threadDots: dots }
    const srcMsg = sourceNode?.data?.promptMessage?.id as string | undefined
    const tgtMsg = targetNode?.data?.promptMessage?.id as string | undefined
    if (!srcMsg || !tgtMsg || !pathGeom) return { inlineGaps: gaps, threadDots: dots }
    for (const n of s.nodeInternals.values()) {
      if (n.type !== 'chatPanel') continue
      const anchor = readOnThread(n.data?.promptMessage?.metadata as Record<string, unknown>)
      if (!anchor) continue
      if (anchor.sourceMessageId !== srcMsg || anchor.targetMessageId !== tgtMsg) continue
      const size = onThreadFrameVisualSize(n)
      const cx = n.position.x + size.width / 2
      const cy = n.position.y + size.height / 2
      const closest = pathGeom.closestT(cx, cy)
      const tan = pathGeom.tangentAt(closest.t)
      const perpAbs = Math.abs((cx - closest.point.x) * -tan.y + (cy - closest.point.y) * tan.x)
      const liveOffset = !isOnThreadInline(anchor) || perpAbs > ON_THREAD_PERP_THRESHOLD
      if (liveOffset) {
        dots.push(closest.point)
      } else {
        gaps.push({ t: closest.t, width: size.width, height: size.height })
      }
    }
    return { inlineGaps: gaps, threadDots: dots }
  },
  // Equality fn is required — a fresh object every store tick re-rendered every thread on
  // frame drag / pan, which is O(threads) per pointer move on content-heavy boards.
  (a, b) =>
    a.inlineGaps.length === b.inlineGaps.length &&
    a.threadDots.length === b.threadDots.length &&
    a.inlineGaps.every(
      (g, i) =>
        g.t === b.inlineGaps[i].t &&
        g.width === b.inlineGaps[i].width &&
        g.height === b.inlineGaps[i].height
    ) &&
    a.threadDots.every((p, i) => p.x === b.threadDots[i].x && p.y === b.threadDots[i].y))
  const gaps = pathGeom ? threadGapsForFrames(pathGeom, inlineGaps) : []
  // Uniform thickness from both endpoint sizes (no along-path taper — that was too heavy for pan/zoom)
  const sourceSize = nodeFlowSize(sourceNode)
  const targetSize = nodeFlowSize(targetNode)

  const stroke =
    selected
      ? THREAD_SELECTED_COLOR // Selection always reads Miro blue
      : data?.strokeColor || (style?.stroke as string) || THREAD_DEFAULT_COLOR // Custom → style → gray
  const baseWidth = selected ? Math.max(strokeWidth, strokeWidth + 0.5) : strokeWidth // Selected reads slightly heavier
  const edgeW = threadStrokeWidthForFrames(baseWidth, sourceSize, targetSize)

  // Gap slices only (on-thread frames) — one path each, same `--tt-edge-w`
  const strokePaths =
    pathGeom != null ? threadStrokePaths(pathGeom, gaps) : [path]

  // Screen size comes from CSS `--tt-board-zoom` (live); do not put strokeWidth inline.
  const { strokeWidth: _ignoredStrokeWidth, ...restStyle } = (style ?? {}) as Record<
    string,
    unknown
  >
  const dash = dotted
    ? `calc(5 * var(--tt-thread-inv-zoom, 1)), calc(5 * var(--tt-thread-inv-zoom, 1))`
    : undefined

  return (
    <>
      {strokePaths.map((d, i) => (
        <BaseEdge
          key={i === 0 ? id : `${id}-gap-${i}`}
          id={i === 0 ? id : `${id}-gap-${i}`}
          path={d}
          markerStart={i === 0 ? markerStart : undefined}
          markerEnd={i === strokePaths.length - 1 ? markerEnd : undefined}
          interactionWidth={20}
          style={{
            ...restStyle,
            stroke,
            ['--tt-edge-w' as string]: String(edgeW), // Unitless flow weight; CSS × 1px × inv-zoom
            strokeDasharray: dash,
          }}
        />
      ))}

      {threadDots.map((pt, i) => (
        <circle
          key={`${id}-on-thread-dot-${i}`}
          className="tt-thread-on-path-dot"
          cx={pt.x}
          cy={pt.y}
          r={ON_THREAD_DOT_R} // Fixed local radius — CSS scale(--tt-frame-ui-scale) keeps screen size
          fill={stroke}
          pointerEvents="none"
        />
      ))}

      {shouldShowPoints &&
        !isConnecting &&
        controlPointsWithIds.map((point, index) => (
          <ControlPoint
            key={point.id}
            index={index}
            setControlPoints={setControlPoints}
            color={THREAD_SELECTED_COLOR}
            {...point}
          />
        ))}
    </>
  )
}

/** Type guard for thread edges that carry editable path data. */
export const isThreadEdge = (edge: Edge): edge is ThreadEdge =>
  edge.type === 'editable' || edge.type === 'animatedDotted'
