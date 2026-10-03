// Sample thread paths for on-thread frame placement + stroke gaps.

import type { Edge, Node, XYPosition, Position } from 'reactflow'
import type { ControlPointData } from '@/components/threads/ControlPoint'
import type { ThreadEdgeData } from '@/components/threads/EditableThread'
import { getPath, getControlPoints } from '@/components/threads/path'
import {
  boardTipArrivalSide,
  getBoardTipBezier,
  getSmoothThreadBezier,
  threadTipCenter,
} from '@/components/threads/path/bezier'
import {
  frameMessageId,
  frameObstaclesFromNodes,
  routeThreadAroundFrames,
  smoothSpreadClear,
  type FrameObstacle,
} from '@/lib/threads/avoid-frames' // Unbent threads route around frames they are not attached to
import {
  NO_SPREAD,
  threadCorridorsFrom,
  threadSpread,
  type ThreadCorridor,
} from '@/lib/threads/separate-threads' // Same lanes the painted stroke uses
import {
  DEFAULT_THREAD_ALGORITHM,
  ThreadAlgorithm,
} from '@/components/threads/constants'
import {
  connectionPointOnNode,
  sideFromHandleId,
} from '@/components/threads/connection-point-on-node'
import type { OnThreadMeta } from '@/lib/threads/on-thread-frame'

export type ThreadPathGeometry = {
  pathD: string // Full SVG path
  length: number // Total arc length (flow px)
  pointAt: (t: number) => XYPosition // t in 0..1
  tangentAt: (t: number) => XYPosition // Unit tangent (source → target)
  normalAt: (t: number, side?: 1 | -1) => XYPosition // Unit normal (left = 1)
  closestT: (x: number, y: number) => { t: number; point: XYPosition; distance: number }
  slicePath: (startT: number, endT: number) => string // Subpath for stroke gaps
}

type BuildArgs = {
  edge: Edge
  sourceNode?: Node
  targetNode?: Node
  sourceX: number
  sourceY: number
  targetX: number
  targetY: number
  sourcePosition: Position
  targetPosition: Position
  sourceHandleId?: string | null
  targetHandleId?: string | null
  arrowHead?: number // Flow px the smooth stroke stops short of the arrow tip
  obstacles?: FrameObstacle[] // Other frames on the board; unbent threads try to route around them
  corridors?: ThreadCorridor[] // Other unbent threads; smooth strokes take a free lane
  pathOverride?: string | null // Stroke already chosen by the caller (keeps gaps on the same path)
}

/** Same routing as EditableThread — shared for placement + gap rendering. */
export function buildThreadPathGeometry(args: BuildArgs): ThreadPathGeometry {
  const data = (args.edge.data as ThreadEdgeData | undefined) || {}
  const algorithm = data.algorithm ?? DEFAULT_THREAD_ALGORITHM
  const points = data.points ?? []
  const sourceSide = sideFromHandleId(args.sourceHandleId, args.sourcePosition)
  const targetSide = sideFromHandleId(args.targetHandleId, args.targetPosition)
  const sourceOrigin: XYPosition =
    connectionPointOnNode(args.sourceNode, sourceSide) ?? {
      x: args.sourceX,
      y: args.sourceY,
    }
  const targetOrigin: XYPosition =
    connectionPointOnNode(args.targetNode, targetSide) ?? {
      x: args.targetX,
      y: args.targetY,
    }
  const fromSide = sourceSide ?? args.sourcePosition
  const toSide = targetSide ?? args.targetPosition
  const sides = { fromSide, toSide }
  const routePoints = [sourceOrigin, ...points, targetOrigin]
  const freeEnd = args.targetNode?.type === 'threadTip' && points.length === 0 // Dropped on the board, not on a frame
  const visualTarget: XYPosition = freeEnd ? threadTipCenter(args.targetNode!) : targetOrigin // Tip center, else the frame side
  const arrivalSide = freeEnd
    ? boardTipArrivalSide(visualTarget.x - sourceOrigin.x, visualTarget.y - sourceOrigin.y) // Arrow points away from the source
    : toSide
  const spread = points.length === 0 ? threadSpread(args.edge.id, args.corridors ?? []) : NO_SPREAD // Lane shared with the paint
  // Unbent only. A manual bend is the user's route and stays put.
  const detour =
    points.length === 0 && !args.pathOverride
      ? routeThreadAroundFrames({
          source: sourceOrigin, // Leave this connection point
          target: visualTarget, // Arrive here
          fromSide, // Out along the source side
          toSide: arrivalSide, // Into the target side, or away from a free end
          sourceId: args.sourceNode?.id ?? args.edge.source, // Don't treat the source frame as an obstacle
          targetId: args.targetNode?.id ?? args.edge.target, // Don't treat the target frame as an obstacle
          sourceMessageId: frameMessageId(args.sourceNode), // Keep this thread's on-thread frames on the stroke
          targetMessageId: frameMessageId(args.targetNode),
          obstacles: args.obstacles ?? [], // Empty → direct stroke
          head: args.arrowHead, // Stroke ends where the arrow begins
          shape:
            algorithm === ThreadAlgorithm.Orthogonal
              ? 'sharp'
              : algorithm === ThreadAlgorithm.Linear
                ? 'linear' // Straight line — do not route around other frames
                : 'smooth',
          sampleSmooth:
            algorithm === ThreadAlgorithm.BezierCatmullRom || algorithm === ThreadAlgorithm.CatmullRom,
          fan: spread.rank * spread.sep, // Same extra lane the painted detour uses
        })
      : null
  if (args.pathOverride) return geometryFromPathD(args.pathOverride, sourceOrigin, visualTarget) // Caller already routed
  if (detour) return geometryFromPathD(detour.path, sourceOrigin, visualTarget) // Around the frames in the way
  const unbentSmooth =
    points.length === 0 &&
    (algorithm === ThreadAlgorithm.BezierCatmullRom ||
      algorithm === ThreadAlgorithm.CatmullRom)
  // Board free end: connection point is the center; stroke and arrow point away from it.
  if (args.targetNode?.type === 'threadTip' && points.length === 0) {
    const tip = threadTipCenter(args.targetNode) // Arrow tip, not the left-side handle
    const pathD = smoothSpreadClear(
      getBoardTipBezier({
        sourceX: sourceOrigin.x, // Frame connection point
        sourceY: sourceOrigin.y,
        sourcePosition: fromSide, // Side the thread left
        targetX: tip.x, // Free end
        targetY: tip.y,
        algorithm, // Honor Smooth / Sharp / Linear
        head: args.arrowHead, // Stroke ends on the back of the arrow
      }),
      spread, // Neighboring lane
      args.obstacles ?? [],
      args.sourceNode?.id ?? args.edge.source,
      args.targetNode?.id ?? args.edge.target
    ).path
    return geometryFromPathD(pathD, sourceOrigin, tip)
  }
  const pathD = unbentSmooth
    ? smoothSpreadClear(
        getSmoothThreadBezier({
          sourceX: sourceOrigin.x,
          sourceY: sourceOrigin.y,
          sourcePosition: fromSide,
          targetX: targetOrigin.x,
          targetY: targetOrigin.y,
          targetPosition: toSide,
          head: args.arrowHead, // Stroke ends on the back of the arrow
        }),
        spread, // Neighboring lane
        args.obstacles ?? [],
        args.sourceNode?.id ?? args.edge.source,
        args.targetNode?.id ?? args.edge.target
      ).path
    : getPath({ points: routePoints, algorithm, sides })

  return geometryFromPathD(pathD, sourceOrigin, targetOrigin)
}

/** Build geometry from an RF edge + live nodes (on-thread drag / insert). */
export function geometryForEdge(edge: Edge, nodes: Node[], edges?: Edge[]): ThreadPathGeometry | null {
  const sourceNode = nodes.find((n) => n.id === edge.source)
  const targetNode = nodes.find((n) => n.id === edge.target)
  if (!sourceNode || !targetNode) return null
  return buildThreadPathGeometry({
    edge,
    sourceNode,
    targetNode,
    sourceX: sourceNode.position.x,
    sourceY: sourceNode.position.y,
    targetX: targetNode.position.x,
    targetY: targetNode.position.y,
    sourcePosition: (edge.sourceHandle as Position) || ('right' as Position),
    targetPosition: (edge.targetHandle as Position) || ('left' as Position),
    sourceHandleId: edge.sourceHandle,
    targetHandleId: edge.targetHandle,
    obstacles: frameObstaclesFromNodes(nodes), // Same boxes the painted thread routes around
    corridors: edges ? threadCorridorsFrom(nodes, edges) : [], // Same lanes the painted stroke uses
  })
}

// Geometry is a pure function of the path string, but building it costs an SVG element plus
// getTotalLength(). Threads re-render on every drag/pan tick, so cache by `d`: only the moving
// thread misses, every other thread on the board is free.
const GEOM_CACHE_MAX = 512
const geomCache = new Map<string, ThreadPathGeometry>()

function geometryFromPathD(
  pathD: string,
  fallbackA: XYPosition,
  fallbackB: XYPosition
): ThreadPathGeometry {
  if (typeof document === 'undefined') {
    return linearFallback(fallbackA, fallbackB)
  }
  const cached = geomCache.get(pathD)
  if (cached) return cached
  const geom = measurePathD(pathD, fallbackA, fallbackB)
  if (geom.pathD === pathD) {
    if (geomCache.size >= GEOM_CACHE_MAX) {
      const oldest = geomCache.keys().next().value // Insertion-ordered — drop the stalest route
      if (oldest !== undefined) geomCache.delete(oldest)
    }
    geomCache.set(pathD, geom)
  }
  return geom
}

function measurePathD(
  pathD: string,
  fallbackA: XYPosition,
  fallbackB: XYPosition
): ThreadPathGeometry {
  const pathEl = document.createElementNS('http://www.w3.org/2000/svg', 'path')
  pathEl.setAttribute('d', pathD)
  let length = 0
  try {
    length = pathEl.getTotalLength()
  } catch {
    return linearFallback(fallbackA, fallbackB)
  }
  if (!Number.isFinite(length) || length < 1) {
    return linearFallback(fallbackA, fallbackB)
  }

  const pointAt = (t: number): XYPosition => {
    const clamped = Math.min(1, Math.max(0, t))
    return pathEl.getPointAtLength(clamped * length)
  }

  const tangentAt = (t: number): XYPosition => {
    const eps = 0.004
    const t0 = Math.max(0, t - eps)
    const t1 = Math.min(1, t + eps)
    const p0 = pointAt(t0)
    const p1 = pointAt(t1)
    const dx = p1.x - p0.x
    const dy = p1.y - p0.y
    const len = Math.hypot(dx, dy) || 1
    return { x: dx / len, y: dy / len }
  }

  const normalAt = (t: number, side: 1 | -1 = 1): XYPosition => {
    const tan = tangentAt(t)
    const nx = -tan.y * side
    const ny = tan.x * side
    return { x: nx, y: ny }
  }

  const closestT = (x: number, y: number) => {
    const steps = 64
    let bestT = 0.5
    let bestDist = Infinity
    let bestPoint = pointAt(0.5)
    for (let i = 0; i <= steps; i++) {
      const t = i / steps
      const p = pointAt(t)
      const d = (p.x - x) ** 2 + (p.y - y) ** 2
      if (d < bestDist) {
        bestDist = d
        bestT = t
        bestPoint = p
      }
    }
    // Refine around the best bin
    const refineSteps = 16
    const span = 1 / steps
    let lo = Math.max(0, bestT - span)
    let hi = Math.min(1, bestT + span)
    for (let i = 0; i <= refineSteps; i++) {
      const t = lo + ((hi - lo) * i) / refineSteps
      const p = pointAt(t)
      const d = (p.x - x) ** 2 + (p.y - y) ** 2
      if (d < bestDist) {
        bestDist = d
        bestT = t
        bestPoint = p
      }
    }
    return { t: bestT, point: bestPoint, distance: Math.sqrt(bestDist) }
  }

  const slicePath = (startT: number, endT: number): string => {
    const a = Math.min(startT, endT)
    const b = Math.max(startT, endT)
    if (b - a < 0.001) return ''
    const startLen = a * length
    const endLen = b * length
    const step = Math.max(2, length / 120)
    const parts: string[] = []
    let first = true
    for (let len = startLen; len <= endLen + 0.01; len += step) {
      const p = pathEl.getPointAtLength(Math.min(len, endLen))
      parts.push(first ? `M ${p.x} ${p.y}` : `L ${p.x} ${p.y}`)
      first = false
    }
    return parts.join(' ')
  }

  return { pathD, length, pointAt, tangentAt, normalAt, closestT, slicePath }
}

function linearFallback(a: XYPosition, b: XYPosition): ThreadPathGeometry {
  const pathD = `M ${a.x} ${a.y} L ${b.x} ${b.y}`
  const dx = b.x - a.x
  const dy = b.y - a.y
  const len = Math.hypot(dx, dy) || 1
  const pointAt = (t: number) => ({
    x: a.x + dx * Math.min(1, Math.max(0, t)),
    y: a.y + dy * Math.min(1, Math.max(0, t)),
  })
  const tangentAt = (): XYPosition => ({ x: dx / len, y: dy / len })
  const normalAt = (_t: number, side: 1 | -1 = 1): XYPosition => {
    const tan = tangentAt() // Constant along a straight line — takes no t
    return { x: -tan.y * side, y: tan.x * side }
  }
  const closestT = (x: number, y: number) => {
    const t = Math.min(1, Math.max(0, ((x - a.x) * dx + (y - a.y) * dy) / (len * len)))
    const point = pointAt(t)
    return { t, point, distance: Math.hypot(point.x - x, point.y - y) }
  }
  const slicePath = (startT: number, endT: number) => {
    const p0 = pointAt(startT)
    const p1 = pointAt(endT)
    return `M ${p0.x} ${p0.y} L ${p1.x} ${p1.y}`
  }
  return { pathD, length: len, pointAt, tangentAt, normalAt, closestT, slicePath }
}

/** Gap sizes along the path for frames sitting on the thread (flow px). */
export function threadGapsForFrames(
  geom: ThreadPathGeometry,
  frames: Array<{ t: number; width: number; height: number }>,
  pad = 6
): Array<{ startT: number; endT: number }> {
  const gaps: Array<{ startT: number; endT: number }> = []
  for (const frame of frames) {
    const half = (Math.max(frame.width, frame.height) + pad) / 2 / Math.max(geom.length, 1)
    gaps.push({
      startT: Math.max(0, frame.t - half),
      endT: Math.min(1, frame.t + half),
    })
  }
  return gaps.sort((a, b) => a.startT - b.startT)
}

/** Build one or more stroke paths with gaps where on-thread frames sit. */
export function threadStrokePaths(
  geom: ThreadPathGeometry,
  gaps: Array<{ startT: number; endT: number }>
): string[] {
  if (gaps.length === 0) return [geom.pathD]
  const merged: Array<{ startT: number; endT: number }> = []
  for (const gap of gaps) {
    const last = merged[merged.length - 1]
    if (last && gap.startT <= last.endT) {
      last.endT = Math.max(last.endT, gap.endT)
    } else {
      merged.push({ ...gap })
    }
  }
  const segments: string[] = []
  let cursor = 0
  for (const gap of merged) {
    if (gap.startT > cursor + 0.001) {
      const seg = geom.slicePath(cursor, gap.startT)
      if (seg) segments.push(seg)
    }
    cursor = gap.endT
  }
  if (cursor < 0.999) {
    const seg = geom.slicePath(cursor, 1)
    if (seg) segments.push(seg)
  }
  return segments.length > 0 ? segments : [geom.pathD]
}

/** Resolve placement for an on-thread frame from its anchor (inline or offset beside the path). */
export function positionForOnThreadFrame(
  geom: ThreadPathGeometry,
  anchor: OnThreadMeta,
  size: { width: number; height: number }
): XYPosition {
  const pathPt = geom.pointAt(anchor.t)
  const offset = anchor.offset ?? 0
  if (offset > 0 && anchor.normalX != null && anchor.normalY != null) {
    return {
      x: pathPt.x + anchor.normalX * offset - size.width / 2,
      y: pathPt.y + anchor.normalY * offset - size.height / 2,
    }
  }
  return {
    x: pathPt.x - size.width / 2,
    y: pathPt.y - size.height / 2,
  }
}
