import { useCallback, useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react' // Stable setters; selected threads re-read the box before paint
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
import { getBoardNavEpoch, isBoardNavigating, subscribeBoardNavigating } from '@/lib/board-navigating' // Skip O(n) scans mid pan/zoom; re-read the painted frame when zoom settles
import { isFrameDragging } from '@/lib/frame-dragging' // Skip O(n) on-thread scans mid frame drag
import { getPath, getControlPoints } from './path' // Path math when user has bent the thread
import {
  boardTipArrivalSide,
  clampArrowHead,
  getBoardTipBezier,
  arrowTipOutsideFrame,
  getSmoothThreadBezier,
  threadArrowLength,
  threadTipCenter,
} from './path/bezier' // Board tip points away; arrow length tracks the stroke
import {
  frameMessageId,
  routeThreadAroundFrames,
  smoothSpreadClear,
  snapshotFrameObstacles,
} from '@/lib/threads/avoid-frames' // Unbent threads route around frames they are not attached to
import {
  NO_SPREAD,
  snapshotThreadCorridors,
  threadSpread,
} from '@/lib/threads/separate-threads' // Neighboring lanes when strokes would sit on each other
import {
  DEFAULT_THREAD_ALGORITHM,
  THREAD_DEFAULT_COLOR,
  THREAD_DEFAULT_STROKE_WIDTH,
  THREAD_SELECTED_COLOR,
  ThreadAlgorithm,
  threadInvZoom,
  threadStrokeWidthForFrames,
} from './constants' // Stroke + algorithm defaults + frame-size thickness
import { normalizeHandleId } from './handle-ids' // Strip -indicator from stored handle ids
import {
  connectionPointOnNode,
  connectionPointPainted,
  sideFromHandleId,
} from './connection-point-on-node' // Frame-edge attach from node box; painted box while zooming
import { useLiveBoardZoom } from '@/lib/use-live-board-zoom' // Selected adjust box resizes on every zoom tick
import {
  closestClearConnection,
  connectionOverlapsFrames,
} from '@/lib/threads/closest-connection' // Switch sides when the current pair would cross a frame
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
  floatHandles?: boolean // Dropped on the frame: sides follow the closest path that stays outside both fills
  locked?: boolean // Lock keeps the current connection points, the way a simulated point does
  sourceHandle?: string // Side last used, so a pinned connection point survives reload
  targetHandle?: string // Side last used on the other frame
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

/** True when two attach points are the same flow pixel (avoids a render loop). */
function sameAttach(a: XYPosition | null, b: XYPosition | null): boolean {
  if (!a && !b) return true // Both missing
  if (!a || !b) return false // One side gained or lost a painted box
  return Math.abs(a.x - b.x) < 1 && Math.abs(a.y - b.y) < 1 // Offset reads jitter under a pixel — that must not be a new end
}

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
  markerStart,
  style,
  data,
}: EditableThreadProps) {
  // Zoom changes frame chrome without a new measure. Re-render when the gesture settles
  // so an unselected frame can drop the box it had while it was selected.
  const navEpoch = useSyncExternalStore(subscribeBoardNavigating, getBoardNavEpoch, getBoardNavEpoch)
  const algorithm = data?.algorithm ?? DEFAULT_THREAD_ALGORITHM
  const points = data?.points ?? []
  const dotted = data?.dotted === true
  const strokeWidth = data?.strokeWidth ?? THREAD_DEFAULT_STROKE_WIDTH // Menu thickness (1–4px)
  const { setEdges } = useReactFlow()

  // Live node boxes — path attaches here even if RF's handle coords are still on an indicator
  const sourceNode = useStore((s) => s.nodeInternals.get(source))
  const targetNode = useStore((s) => s.nodeInternals.get(target))
  // Booleans so Open stack (hidden → false) always re-renders the shaft
  const sourceHidden = useStore((s) => s.nodeInternals.get(source)?.hidden === true)
  const targetHidden = useStore((s) => s.nodeInternals.get(target)?.hidden === true)
  // Hover stack peek — fade thread with the frame (in / out anim)
  const stackPeekPhase = useStore((s) => {
    const classes = [source, target].map((id) => s.nodeInternals.get(id)?.className)
    const has = (token: string) =>
      classes.some((c) => typeof c === 'string' && c.split(/\s+/).includes(token))
    if (has('tt-stack-preview-out')) return 'out' as const // Fading away
    if (has('tt-stack-preview')) return 'in' as const // Peeking at restoreAbs
    return 'off' as const
  })
  // Mount at 0 then ease to 0.72 so the shaft does not pop in with the frame
  const [peekStrokeOp, setPeekStrokeOp] = useState(() =>
    stackPeekPhase === 'in' || stackPeekPhase === 'out' ? 0 : 1
  )
  useLayoutEffect(() => {
    if (stackPeekPhase === 'out') {
      setPeekStrokeOp(0)
      return
    }
    if (stackPeekPhase === 'in') {
      setPeekStrokeOp(0)
      const id = requestAnimationFrame(() => setPeekStrokeOp(0.72))
      return () => cancelAnimationFrame(id)
    }
    setPeekStrokeOp(1)
  }, [stackPeekPhase])

  const sourceSide = sideFromHandleId(sourceHandleId, sourcePosition)
  const targetSide = sideFromHandleId(targetHandleId, targetPosition)
  // Far sides hook the curve back through the frames. Unbent threads hop to the closest clear pair.
  // A locked thread keeps the sides it had when it was locked.
  const clearPair =
    data?.locked !== true &&
    points.length === 0 &&
    sourceNode &&
    targetNode &&
    sourceNode.type !== 'threadTip' &&
    targetNode.type !== 'threadTip' &&
    connectionOverlapsFrames(sourceNode, targetNode, sourceHandleId, targetHandleId)
      ? closestClearConnection(sourceNode, targetNode)
      : null
  // Selected chrome resizes every zoom tick. After deselect, the store width can still be
  // that adjust box — read the panel that is actually painted, including once chrome is gone.
  const endpointSelected = Boolean(sourceNode?.selected || targetNode?.selected)
  const liveZoom = useLiveBoardZoom(endpointSelected) // No per-tick subscription while both ends are idle
  const sourceFlowX = sourceNode?.positionAbsolute?.x ?? sourceNode?.position.x // Drag/move, not a new object each render
  const sourceFlowY = sourceNode?.positionAbsolute?.y ?? sourceNode?.position.y
  const targetFlowX = targetNode?.positionAbsolute?.x ?? targetNode?.position.x
  const targetFlowY = targetNode?.positionAbsolute?.y ?? targetNode?.position.y
  // clearPair reads the painted fill. Selection chrome moves that fill, the layout
  // effect below writes new ends, and the next read picks the other pair. Two hops
  // while the frames stay put; a third is that loop, so keep the pair we already took.
  const pairLatch = useRef<{ pos: string; pair: typeof clearPair; flips: number }>({
    pos: '',
    pair: null,
    flips: 0,
  })
  const pairPos = `${endpointSelected ? 1 : 0}|${Math.round(sourceFlowX ?? 0)}|${Math.round(sourceFlowY ?? 0)}|${Math.round(targetFlowX ?? 0)}|${Math.round(targetFlowY ?? 0)}` // Whole pixels — subpixel glue is not a move
  const livePairKey = clearPair ? `${clearPair.sourceHandle}:${clearPair.targetHandle}` : '' // Sides only — the object is new every render
  if (pairLatch.current.pos !== pairPos) {
    pairLatch.current = { pos: pairPos, pair: clearPair, flips: 0 } // Frame moved or selection changed — trust this read
  } else {
    const latchedKey = pairLatch.current.pair
      ? `${pairLatch.current.pair.sourceHandle}:${pairLatch.current.pair.targetHandle}`
      : ''
    if (latchedKey !== livePairKey && pairLatch.current.flips < 2) {
      pairLatch.current = { pos: pairPos, pair: clearPair, flips: pairLatch.current.flips + 1 } // Accept one correction, then one settle
    }
  }
  const stableClearPair = pairLatch.current.pair // Pair the stroke and the persist effect both use
  const usedSourceSide = stableClearPair
    ? sideFromHandleId(stableClearPair.sourceHandle, sourceSide) ?? sourceSide
    : sourceSide
  const usedTargetSide = stableClearPair
    ? sideFromHandleId(stableClearPair.targetHandle, targetSide) ?? targetSide
    : targetSide
  const [paintedEnds, setPaintedEnds] = useState<{
    source: XYPosition | null
    target: XYPosition | null
  } | null>(null)
  const paintedWriteCap = useRef(0) // Layout writes for this measure key — a third nests until max update depth
  const paintedWriteKey = useRef('') // Zoom / move / side the cap belongs to — not the measured point
  useLayoutEffect(() => {
    // The point itself is not part of the key. A write moves that point, which would
    // reset the cap and keep the nested updates going.
    const measureKey = `${pairPos}|${Math.round(liveZoom * 1000)}|${navEpoch}|${usedSourceSide}|${usedTargetSide}`
    if (paintedWriteKey.current !== measureKey) {
      paintedWriteKey.current = measureKey // New zoom tick, move, or accepted side — two fresh writes
      paintedWriteCap.current = 0
    }
    const dragging = isFrameDragging() // A drag moves the node every tick — don't freeze the last box
    const sourcePt = connectionPointPainted(sourceNode, usedSourceSide) // Fill edge after this commit's chrome
    const targetPt = connectionPointPainted(targetNode, usedTargetSide)
    setPaintedEnds((prev) => {
      // Keep the last fill when the panel is mid-unmount. A drag falls through to the live node box.
      const nextSource = sourcePt ?? (dragging ? null : prev?.source ?? null)
      const nextTarget = targetPt ?? (dragging ? null : prev?.target ?? null)
      if (sameAttach(prev?.source ?? null, nextSource) && sameAttach(prev?.target ?? null, nextTarget)) {
        return prev // Same pixel — don't render the thread again
      }
      // New ends change the path, which changes the next painted read. Two writes
      // settle selection chrome. Returning prev bails, so a third cannot nest.
      if (paintedWriteCap.current >= 2) return prev
      paintedWriteCap.current += 1 // Count only a write that actually schedules a render
      return { source: nextSource, target: nextTarget }
    })
  }, [
    endpointSelected, // Deselect drops the adjust box — read the fill that replaced it
    liveZoom, // Selected adjust box changes size during the gesture
    navEpoch, // Zoom finished while selected; unselected box is the one to keep
    usedSourceSide,
    usedTargetSide,
    source,
    target,
    sourceFlowX,
    sourceFlowY,
    targetFlowX,
    targetFlowY,
  ])

  const sourceOrigin: XYPosition =
    paintedEnds?.source ??
    connectionPointOnNode(sourceNode, usedSourceSide) ??
    { x: sourceX, y: sourceY }
  const targetOrigin: XYPosition =
    paintedEnds?.target ??
    connectionPointOnNode(targetNode, usedTargetSide) ??
    { x: targetX, y: targetY }

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

  const persistPairRef = useRef('') // Sides already sent — writing them again nested setEdges
  // Remember the closer sides so the next move, reload, and peers don't snap back to the overlap.
  // Selection chrome flips the pair. Saving that from this effect nested setEdges until max update depth.
  useEffect(() => {
    if (endpointSelected) return // Fill is still moving — save after the frames are idle
    if (!stableClearPair) {
      persistPairRef.current = '' // No hop to remember
      return
    }
    const nextSource = stableClearPair.sourceHandle // Side the latch settled on
    const nextTarget = stableClearPair.targetHandle
    const haveSource = normalizeHandleId(sourceHandleId) || sourceHandleId // left-indicator and left are one side
    const haveTarget = normalizeHandleId(targetHandleId) || targetHandleId
    if (haveSource === nextSource && haveTarget === nextTarget) {
      persistPairRef.current = '' // Store matches — a later move may save again
      return
    }
    const key = `${nextSource}:${nextTarget}` // Pair identity, not a new object each read
    if (persistPairRef.current === key) return // This write already happened and the store did not stick
    persistPairRef.current = key
    setEdges((edges) => {
      let changed = false // map() is a new array even when the thread already has these sides
      const next = edges.map((e) => {
        if (e.id !== id) return e
        const prev = (e.data as ThreadEdgeData | undefined) ?? {}
        if (e.sourceHandle === nextSource && e.targetHandle === nextTarget) return e // Already stored
        changed = true
        return {
          ...e,
          sourceHandle: nextSource, // Side that leaves the source frame
          targetHandle: nextTarget, // Side that enters the target frame
          data: {
            ...prev,
            sourceHandle: nextSource,
            targetHandle: nextTarget,
          },
        }
      })
      return changed ? next : edges // Same array — do not re-render the board
    })
  }, [endpointSelected, stableClearPair?.sourceHandle, stableClearPair?.targetHandle, id, sourceHandleId, targetHandleId, setEdges])

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

  const fromSide = usedSourceSide ?? Position.Right
  const toSide = usedTargetSide ?? Position.Left
  const sides = { fromSide, toSide }
  const zoom = useStore((s) => s.transform[2] || 1) // Live board zoom — head length is stroke / zoom
  const edgeWForHead = threadStrokeWidthForFrames(
    selected ? Math.max(strokeWidth, strokeWidth + 0.5) : strokeWidth, // Same weight the stroke CSS uses
    nodeFlowSize(sourceNode),
    nodeFlowSize(targetNode)
  )
  const strokeUser = edgeWForHead * threadInvZoom(zoom) // Same user units as `--tt-edge-w * inv-zoom`
  const tipPoint = targetNode?.type === 'threadTip' ? threadTipCenter(targetNode) : targetOrigin // Arrow tip
  const headSpan = Math.hypot(tipPoint.x - sourceOrigin.x, tipPoint.y - sourceOrigin.y) || 1 // Room before the head
  const head = clampArrowHead(threadArrowLength(strokeUser), headSpan) // Stroke stops this far short of the tip
  const pathTarget =
    targetNode?.type === 'threadTip'
      ? targetOrigin // Free end — the arrow is the tip, nothing covers it
      : arrowTipOutsideFrame(targetOrigin, toSide, head, headSpan) // Whole head sits outside the fill
  const obstacles = useStore((s) => snapshotFrameObstacles(s.nodeInternals)) // Shared frame boxes for this store snapshot
  const corridors = useStore((s) => snapshotThreadCorridors(s.nodeInternals, s.edges)) // Other unbent threads
  const spread = points.length === 0 ? threadSpread(id, corridors) : NO_SPREAD // Lane among threads that share this run
  const freeEnd = points.length === 0 && targetNode?.type === 'threadTip' // Dropped on the board
  const routeTarget = freeEnd ? threadTipCenter(targetNode!) : pathTarget // Tip center, else just outside the fill
  const arrivalSide = freeEnd
    ? boardTipArrivalSide(routeTarget.x - sourceOrigin.x, routeTarget.y - sourceOrigin.y) // Arrow points away from the source
    : toSide
  // Manual bends stay. Otherwise step around frames this thread is not attached to.
  const detour =
    points.length === 0
      ? routeThreadAroundFrames({
          source: sourceOrigin, // Leave this connection point
          target: routeTarget, // Arrive here
          fromSide, // Out along the source side
          toSide: arrivalSide, // Into the target side
          sourceId: source, // Not an obstacle
          targetId: target, // Not an obstacle
          sourceMessageId: frameMessageId(sourceNode), // On-thread frames of this pair stay on the stroke
          targetMessageId: frameMessageId(targetNode),
          obstacles, // Every other frame
          head, // Stroke ends where the arrow begins
          shape:
            algorithm === ThreadAlgorithm.Orthogonal
              ? 'sharp' // Ridged elbows
              : algorithm === ThreadAlgorithm.Linear
                ? 'linear' // Straight line — do not route around other frames
                : 'smooth', // Default thread curve
          sampleSmooth:
            algorithm === ThreadAlgorithm.BezierCatmullRom || algorithm === ThreadAlgorithm.CatmullRom,
          fan: spread.rank * spread.sep, // Detour sits one lane further out than a neighbor on the same side
        })
      : null

  // Route for editable knobs (user bends). Unbent Smooth uses getSmoothThreadBezier below —
  // Catmull stubs added S-curves; RF getBezierPath went flat on same-side snapped frames.
  const routePoints = [sourceOrigin, ...points, pathTarget] // Bent tips use the same outside point
  const unbentSmooth =
    points.length === 0 &&
    (algorithm === ThreadAlgorithm.BezierCatmullRom ||
      algorithm === ThreadAlgorithm.CatmullRom)
  // Dropped on the board: the connection point is the center; the knob sits on the away curve.
  const boardTip =
    !detour && points.length === 0 && targetNode?.type === 'threadTip'
      ? smoothSpreadClear(
          getBoardTipBezier({
            sourceX: sourceOrigin.x, // Frame connection point
            sourceY: sourceOrigin.y,
            sourcePosition: fromSide, // Side the thread left
            targetX: threadTipCenter(targetNode).x, // Arrow tip
            targetY: threadTipCenter(targetNode).y,
            algorithm,
            head, // Stroke ends on the back of the arrow
          }),
          spread, // Neighboring lane, when another thread already uses this run
          obstacles,
          source,
          target
        )
      : null
  const smoothBezier = detour
    ? null // The detour path replaces the direct cubic
    : boardTip
    ? boardTip
    : unbentSmooth
    ? smoothSpreadClear(
        getSmoothThreadBezier({
          sourceX: sourceOrigin.x, // Frame-edge attach, not the outer indicator
          sourceY: sourceOrigin.y,
          sourcePosition: fromSide, // Snapped side (top↔top when frames sit left/right)
          targetX: pathTarget.x, // Just outside the fill so the head is not covered
          targetY: pathTarget.y,
          targetPosition: toSide,
          head, // Stroke ends on the back of the arrow
        }),
        spread, // Neighboring lane, when another thread already uses this run
        obstacles,
        source,
        target
      )
    : null
  const controlPoints = detour
    ? [{ id: '', active: false, x: detour.mid.x, y: detour.mid.y }] // Knob on the clear lane
    : boardTip
    ? [{ id: '', active: false, x: boardTip.mid.x, y: boardTip.mid.y }] // Knob on the away curve
    : unbentSmooth
    ? [{ id: '', active: false, x: smoothBezier!.mid.x, y: smoothBezier!.mid.y }] // Hollow knob on the arch, not the chord
    : getControlPoints({
        points: routePoints,
        algorithm,
        sides,
      })
  const controlPointsWithIds = useIdsForInactiveControlPoints(controlPoints)

  // Unbent Smooth → bowed cubic (same-side) / RF bezier (opposite). Bent / Sharp / Linear → waypoints.
  const path = detour
    ? detour.path // Around frames this thread is not attached to
    : smoothBezier
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
          arrowHead: boardTip || unbentSmooth || detour ? head : 0, // Bent paths still run to the tip
          pathOverride: path, // Same stroke that paints, including the tip sitting outside the fill
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
  const edgeW = edgeWForHead // CSS thickness; the arrow head uses this same weight

  const stroke =
    selected
      ? THREAD_SELECTED_COLOR // Selection always reads Miro blue
      : data?.strokeColor || (style?.stroke as string) || THREAD_DEFAULT_COLOR // Custom → style → gray
  // Match `.tt-stack-preview` / `-out` (80ms) — CSS on the frame; edge uses the same timing
  const strokeOpacity = stackPeekPhase === 'off' ? 1 : peekStrokeOp

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
  const arrowId = `tt-thread-arrow-${id.replace(/[^A-Za-z0-9_-]/g, '')}` // Unique so selection can recolor this head
  // Stack under: hide shaft — FrameStackRevealLine keeps the sim-point arrow. Open stack: full thread.
  if (sourceHidden || targetHidden) {
    return null
  }

  return (
    <>
      <defs>
        <marker
          id={arrowId} // Referenced by the last stroke slice
          className="react-flow__arrowhead"
          markerWidth={head * 4} // 20/5 × head so the tip lands on the connection point
          markerHeight={head * 4} // Square box — wings stay proportional to the stroke
          viewBox="-10 -10 20 20"
          markerUnits="userSpaceOnUse" // Flow px, same space as the zoom-compensated stroke
          orient="auto-start-reverse" // Head follows the path into the target
          refX={boardTip || unbentSmooth || detour ? -5 : 0} // Back of the head on an inset stroke; tip on a full stroke
          refY="0"
        >
          <polyline
            points="-5,-4 0,0 -5,4 -5,-4" // Closed arrow
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{
              stroke,
              fill: stroke,
              strokeWidth: 1,
              opacity: strokeOpacity,
              transition: 'opacity 80ms ease', // Sync with stack peek frame anim
            }}
          />
        </marker>
      </defs>
      {strokePaths.map((d, i) => (
        <BaseEdge
          key={i === 0 ? id : `${id}-gap-${i}`}
          id={i === 0 ? id : `${id}-gap-${i}`}
          path={d}
          markerStart={i === 0 ? markerStart : undefined}
          markerEnd={i === strokePaths.length - 1 ? `url(#${arrowId})` : undefined} // Every thread ends in an arrow
          interactionWidth={20}
          style={{
            ...restStyle,
            stroke,
            opacity: strokeOpacity, // Peek in 0.72 / out 0 / idle 1
            transition: 'opacity 80ms ease', // Same as `.tt-stack-preview` keyframes
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
