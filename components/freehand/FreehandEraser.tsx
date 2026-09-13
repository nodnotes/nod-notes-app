// Eraser overlay for Draw mode — stroke deletes whole ink; spot splits paint into separate drawings
import { useRef, useState, type PointerEvent } from 'react' // Capture erase gestures without RF pan
import { useReactFlow, useStore, type Node } from 'reactflow' // Flow coords + live freehand nodes + zoom
import { useReactFlowContext } from '@/components/react-flow-context' // eraserMode + tip size + zoom lock
import { generateUUID } from '@/lib/utils' // New ids for split-off pieces

import { DEFAULT_STROKE_SIZE, DEFAULT_ERASER_TIP_DIAMETER_PX, pathOptions } from './path' // Stroke width + default eraser tip
import type { Points } from './types' // [x, y, pressure] tuples on freehand nodes
import type { FreehandNodeData, FreehandNodeType } from './FreehandNode' // Node shape

/** Squared distance from point P to segment AB (flow space). */
function dist2PointToSegment(
  px: number,
  py: number,
  ax: number,
  ay: number,
  bx: number,
  by: number,
) {
  const dx = bx - ax
  const dy = by - ay
  const len2 = dx * dx + dy * dy
  if (len2 === 0) {
    const ex = px - ax
    const ey = py - ay
    return ex * ex + ey * ey
  }
  let t = ((px - ax) * dx + (py - ay) * dy) / len2
  t = Math.max(0, Math.min(1, t))
  const qx = ax + t * dx
  const qy = ay + t * dy
  const ex = px - qx
  const ey = py - qy
  return ex * ex + ey * ey
}

type FreehandData = FreehandNodeData

/** Resolve AABB + content box for hit tests / split math. */
function freehandSize(node: Node) {
  const data = node.data as FreehandData | undefined
  const initialW = data?.initialSize?.width ?? 0
  const initialH = data?.initialSize?.height ?? 0
  const aabbW = (node.width as number | undefined) ?? initialW
  const aabbH = (node.height as number | undefined) ?? initialH
  const rotation = typeof data?.rotation === 'number' ? data.rotation : 0
  const contentW =
    Math.abs(rotation) <= 0.5
      ? aabbW
      : data?.contentSize?.width && data.contentSize.width > 0
        ? data.contentSize.width
        : initialW || aabbW
  const contentH =
    Math.abs(rotation) <= 0.5
      ? aabbH
      : data?.contentSize?.height && data.contentSize.height > 0
        ? data.contentSize.height
        : initialH || aabbH
  return { w: aabbW, h: aabbH, contentW, contentH, initialW, initialH, rotation, data }
}

/** Local stroke sample → absolute flow coords (rotation around content center in AABB). */
function localToFlow(
  localX: number,
  localY: number,
  nodeX: number,
  nodeY: number,
  contentW: number,
  contentH: number,
  aabbW: number,
  aabbH: number,
  scaleX: number,
  scaleY: number,
  rotation: number,
) {
  const lx = localX * scaleX - contentW / 2
  const ly = localY * scaleY - contentH / 2
  if (Math.abs(rotation) <= 0.5) {
    return { x: nodeX + localX * scaleX, y: nodeY + localY * scaleY }
  }
  const rad = (rotation * Math.PI) / 180
  const c = Math.cos(rad)
  const s = Math.sin(rad)
  return {
    x: nodeX + aabbW / 2 + lx * c - ly * s,
    y: nodeY + aabbH / 2 + lx * s + ly * c,
  }
}

/** True when the eraser tip hits this freehand stroke (stroke mode / split gate). */
function freehandIntersectsEraser(
  node: Node,
  flowX: number,
  flowY: number,
  radiusFlow: number,
) {
  if (node.type !== 'freehand') return false
  const { w, h, contentW, contentH, initialW, initialH, rotation, data } = freehandSize(node)
  const x = node.position.x
  const y = node.position.y
  const pad = radiusFlow
  if (flowX < x - pad || flowX > x + w + pad || flowY < y - pad || flowY > y + h + pad) {
    return false
  }
  const points = data?.points
  if (!points || points.length === 0) {
    return flowX >= x && flowX <= x + w && flowY >= y && flowY <= y + h
  }
  const scaleX = initialW > 0 ? contentW / initialW : 1
  const scaleY = initialH > 0 ? contentH / initialH : 1
  const strokeSize = typeof data?.strokeSize === 'number' ? data.strokeSize : pathOptions.size
  const paintedStroke = strokeSize * Math.min(scaleX, scaleY)
  // Tip overlaps painted stamp (not only the skeleton)
  const hitR = radiusFlow + paintedStroke * 0.5
  const hitR2 = hitR * hitR
  let prev = localToFlow(points[0][0], points[0][1], x, y, contentW, contentH, w, h, scaleX, scaleY, rotation)
  const dx0 = prev.x - flowX
  const dy0 = prev.y - flowY
  if (dx0 * dx0 + dy0 * dy0 <= hitR2) return true
  for (let i = 1; i < points.length; i++) {
    const cur = localToFlow(points[i][0], points[i][1], x, y, contentW, contentH, w, h, scaleX, scaleY, rotation)
    if (dist2PointToSegment(flowX, flowY, prev.x, prev.y, cur.x, cur.y) <= hitR2) return true
    prev = cur
  }
  return false
}

/**
 * Keep polyline runs outside the tip disk; interpolate crossings so cut ends sit on the circle.
 * clipR = tipR + paintR → round caps leave a tip-sized hole (not a V-notch).
 */
function clipPolylineOutsideBrush(
  points: Points,
  cx: number,
  cy: number,
  clipR: number,
): Points[] {
  if (points.length === 0 || !(clipR > 0)) return points.length ? [points] : []
  const r2 = clipR * clipR
  const outside = (x: number, y: number) => (x - cx) * (x - cx) + (y - cy) * (y - cy) > r2

  /** Point on AB at the circle boundary closest to B when A is inside / B outside (or reverse). */
  function edgePoint(
    ax: number,
    ay: number,
    bx: number,
    by: number,
    aOut: boolean,
  ): [number, number, number] {
    // Binary search the crossing (stable for short segments)
    let t0 = 0
    let t1 = 1
    for (let i = 0; i < 12; i++) {
      const tm = (t0 + t1) / 2
      const mx = ax + (bx - ax) * tm
      const my = ay + (by - ay) * tm
      const o = outside(mx, my)
      if (o === aOut) t0 = tm
      else t1 = tm
    }
    const t = (t0 + t1) / 2
    return [ax + (bx - ax) * t, ay + (by - ay) * t, 1]
  }

  const runs: Points[] = []
  let cur: Points = []
  let prev = points[0]
  let prevOut = outside(prev[0], prev[1])
  if (prevOut) cur.push([prev[0], prev[1], prev[2] ?? 1])

  for (let i = 1; i < points.length; i++) {
    const p = points[i]
    const out = outside(p[0], p[1])
    if (prevOut && out) {
      cur.push([p[0], p[1], p[2] ?? 1])
    } else if (prevOut && !out) {
      // Leaving outside → close run at boundary
      cur.push(edgePoint(prev[0], prev[1], p[0], p[1], true))
      if (cur.length >= 1) runs.push(cur)
      cur = []
    } else if (!prevOut && out) {
      // Entering outside → open run at boundary
      cur = [edgePoint(prev[0], prev[1], p[0], p[1], false), [p[0], p[1], p[2] ?? 1]]
    }
    prev = p
    prevOut = out
  }
  if (cur.length >= 1) runs.push(cur)

  // Drop tiny crumbs (noise from densified samples)
  const minLen = Math.max(clipR * 0.15, 1)
  return runs.filter((run) => {
    if (run.length >= 2) {
      let len = 0
      for (let i = 1; i < run.length; i++) {
        len += Math.hypot(run[i][0] - run[i - 1][0], run[i][1] - run[i - 1][1])
      }
      return len >= minLen
    }
    // Single sample — keep if it is a meaningful dab
    return run.length === 1
  })
}

/** Flow-space samples → freehand node geometry (padded bbox, local points). */
function nodeGeometryFromFlowPoints(points: Points, strokeSize: number) {
  let x1 = Infinity
  let y1 = Infinity
  let x2 = -Infinity
  let y2 = -Infinity
  const flowPoints: Points = points.map(([x, y, p]) => [x, y, p ?? 1])
  for (const [x, y] of flowPoints) {
    x1 = Math.min(x1, x)
    y1 = Math.min(y1, y)
    x2 = Math.max(x2, x)
    y2 = Math.max(y2, y)
  }
  const thickness = strokeSize * 0.5
  x1 -= thickness
  y1 -= thickness
  x2 += thickness
  y2 += thickness
  for (const pt of flowPoints) {
    pt[0] -= x1
    pt[1] -= y1
  }
  let width = x2 - x1
  let height = y2 - y1
  const minSize = strokeSize * 2
  if (width < minSize) {
    const cx = (x1 + x2) / 2
    x1 = cx - minSize / 2
    width = minSize
  }
  if (height < minSize) {
    const cy = (y1 + y2) / 2
    y1 = cy - minSize / 2
    height = minSize
  }
  return {
    position: { x: x1, y: y1 },
    width,
    height,
    points: flowPoints,
  }
}

export type SpotEraseMutation = {
  removeIds: string[] // Fully erased strokes (no remaining paint)
  upsertNodes: FreehandNodeType[] // Updated pieces + brand-new split-off drawings
}

/**
 * Carve the tip disk out of a stroke’s centerline.
 * One remaining run → same node updated; several → separate drawings (own adjust + connection points).
 * Round caps (no taper) face the tip-sized gap.
 */
function spotSplitStroke(
  node: Node,
  flowX: number,
  flowY: number,
  radiusFlow: number,
): SpotEraseMutation | null {
  if (node.type !== 'freehand') return null
  if (!freehandIntersectsEraser(node, flowX, flowY, radiusFlow)) return null

  const { w, h, contentW, contentH, initialW, initialH, rotation, data } = freehandSize(node)
  const points = data?.points
  if (!points || points.length === 0) {
    return { removeIds: [node.id], upsertNodes: [] }
  }

  const scaleX = initialW > 0 ? contentW / initialW : 1
  const scaleY = initialH > 0 ? contentH / initialH : 1
  const strokeSize = typeof data?.strokeSize === 'number' ? data.strokeSize : DEFAULT_STROKE_SIZE
  const paintedStroke = strokeSize * Math.min(scaleX, scaleY)
  // Tip hole clears round caps: clip centerline by tipR + paintR
  const clipR = radiusFlow + paintedStroke * 0.5

  const flowPts: Points = points.map((p) => {
    const pt = localToFlow(
      p[0],
      p[1],
      node.position.x,
      node.position.y,
      contentW,
      contentH,
      w,
      h,
      scaleX,
      scaleY,
      rotation,
    )
    return [pt.x, pt.y, 1]
  })

  const runs = clipPolylineOutsideBrush(flowPts, flowX, flowY, clipR)
  if (runs.length === 0) {
    return { removeIds: [node.id], upsertNodes: [] }
  }

  // Unchanged geometry (tip missed the skeleton after inflate) — skip
  if (
    runs.length === 1 &&
    runs[0].length === flowPts.length &&
    runs[0].every((p, i) => Math.hypot(p[0] - flowPts[i][0], p[1] - flowPts[i][1]) < 0.01)
  ) {
    return null
  }

  const base = data as FreehandNodeData
  const upsertNodes: FreehandNodeType[] = runs.map((run, index) => {
    const geo = nodeGeometryFromFlowPoints(run, paintedStroke)
    const id = index === 0 ? node.id : generateUUID() // First piece keeps id; rest are new drawings
    const nextData: FreehandNodeData = {
      points: geo.points,
      initialSize: { width: geo.width, height: geo.height },
      strokeSize: paintedStroke,
      inkKind: base.inkKind,
      strokeColor: base.strokeColor,
      // Fresh upright piece — drop rotation / holes / legacy tapers from the parent
    }
    return {
      id,
      type: 'freehand',
      position: geo.position,
      width: geo.width,
      height: geo.height,
      style: { width: geo.width, height: geo.height },
      data: nextData,
      selectable: true,
      draggable: true,
    } satisfies FreehandNodeType
  })

  return { removeIds: [], upsertNodes }
}

/**
 * Full-board overlay while Draw → Eraser is armed.
 * Stroke mode removes whole freehand nodes; spot mode splits paint into separate drawings.
 */
export function FreehandEraser({
  onBeforeErase,
  onEraseNodes,
  onSpotMutate,
}: {
  onBeforeErase?: () => void
  onEraseNodes: (ids: string[]) => void
  onSpotMutate: (mutation: SpotEraseMutation) => void
}) {
  const { eraserMode, eraserTipSize, eraserTipZoomLocked } = useReactFlowContext()
  const { screenToFlowPosition, getNodes, setNodes } = useReactFlow()
  const zoom = useStore((s) => s.transform[2] || 1) // Live zoom so unlocked tip ring tracks pinch
  const erasingRef = useRef(false)
  const erasedIdsRef = useRef(new Set<string>())
  const snapshotTakenRef = useRef(false)
  const lastSpotFlowRef = useRef<{ x: number; y: number } | null>(null)
  const [cursor, setCursor] = useState<{ x: number; y: number } | null>(null)
  const tipAuthored = eraserTipSize || DEFAULT_ERASER_TIP_DIAMETER_PX // Thickness bar value
  // Screen ring: locked = fixed px; unlocked = scales with zoom (board-relative)
  const tipDiameterPx = eraserTipZoomLocked ? tipAuthored : tipAuthored * Math.max(0.01, zoom)
  // Flow carve radius: locked = tip ÷ zoom; unlocked = tip is already flow-space
  const tipRadiusFlow = eraserTipZoomLocked
    ? tipAuthored / 2 / Math.max(0.01, zoom)
    : tipAuthored / 2

  /** Apply a spot mutation to RF immediately so the next sample sees fresh geometry. */
  function applySpotLocally(mutation: SpotEraseMutation) {
    const removeSet = new Set(mutation.removeIds)
    const upsertById = new Map(mutation.upsertNodes.map((n) => [n.id, n]))
    setNodes((nds: Node[]) => {
      const next = nds
        .filter((n) => !removeSet.has(n.id))
        .map((n) => upsertById.get(n.id) ?? n)
      const present = new Set(next.map((n) => n.id))
      const created = mutation.upsertNodes.filter((n) => !present.has(n.id))
      return [...next, ...created]
    })
  }

  /**
   * Split every freehand stroke under tip samples (densified drag).
   * Accumulates in-memory so React setNodes races don’t drop pieces.
   */
  function splitSamples(samples: { x: number; y: number }[], radiusFlow: number) {
    if (samples.length === 0) return
    const liveById = new Map<string, Node>()
    for (const node of getNodes()) {
      if (node.type === 'freehand') liveById.set(node.id, node)
    }
    const removeIds: string[] = []
    const upsertById = new Map<string, FreehandNodeType>()

    for (const sample of samples) {
      for (const [id, node] of [...liveById]) {
        if (removeIds.includes(id)) continue
        const split = spotSplitStroke(node, sample.x, sample.y, radiusFlow)
        if (!split) continue
        if (split.removeIds.length > 0) {
          removeIds.push(...split.removeIds)
          liveById.delete(id)
          upsertById.delete(id)
          continue
        }
        // Replace this live node with all resulting pieces (1 = trim, 2+ = separate drawings)
        liveById.delete(id)
        upsertById.delete(id)
        for (const piece of split.upsertNodes) {
          liveById.set(piece.id, piece)
          upsertById.set(piece.id, piece)
        }
      }
    }

    const upsertNodes = [...upsertById.values()]
    if (removeIds.length === 0 && upsertNodes.length === 0) return
    if (!snapshotTakenRef.current) {
      onBeforeErase?.()
      snapshotTakenRef.current = true
    }
    const mutation = { removeIds, upsertNodes }
    applySpotLocally(mutation)
    onSpotMutate(mutation)
  }

  function eraseStrokeAt(clientX: number, clientY: number) {
    const { x, y } = screenToFlowPosition({ x: clientX, y: clientY })
    const radiusFlow = tipRadiusFlow
    const hits: string[] = []
    for (const node of getNodes()) {
      if (erasedIdsRef.current.has(node.id)) continue
      if (!freehandIntersectsEraser(node, x, y, radiusFlow)) continue
      hits.push(node.id)
      erasedIdsRef.current.add(node.id)
    }
    if (hits.length === 0) return
    if (!snapshotTakenRef.current) {
      onBeforeErase?.()
      snapshotTakenRef.current = true
    }
    onEraseNodes(hits)
  }

  function eraseSpotAt(clientX: number, clientY: number) {
    const { x, y } = screenToFlowPosition({ x: clientX, y: clientY })
    const radiusFlow = tipRadiusFlow
    const prev = lastSpotFlowRef.current
    lastSpotFlowRef.current = { x, y }
    const samples: { x: number; y: number }[] = []
    if (prev) {
      const dx = x - prev.x
      const dy = y - prev.y
      const dist = Math.hypot(dx, dy)
      const step = Math.max(radiusFlow * 0.45, 0.5)
      if (dist > step) {
        const n = Math.floor(dist / step)
        for (let i = 1; i < n; i++) {
          const t = i / n
          samples.push({ x: prev.x + dx * t, y: prev.y + dy * t })
        }
      }
    }
    samples.push({ x, y })
    splitSamples(samples, radiusFlow)
  }

  function eraseAt(clientX: number, clientY: number) {
    if (eraserMode === 'spot') eraseSpotAt(clientX, clientY)
    else eraseStrokeAt(clientX, clientY)
  }

  function containerPoint(clientX: number, clientY: number) {
    const el = document.querySelector('.react-flow') as HTMLElement | null
    if (!el) return null
    const r = el.getBoundingClientRect()
    return { x: clientX - r.left, y: clientY - r.top }
  }

  function handlePointerDown(e: PointerEvent<HTMLDivElement>) {
    if (e.button !== 0) return
    ;(e.target as HTMLDivElement).setPointerCapture(e.pointerId)
    erasingRef.current = true
    erasedIdsRef.current = new Set()
    snapshotTakenRef.current = false
    lastSpotFlowRef.current = null
    setCursor(containerPoint(e.clientX, e.clientY))
    eraseAt(e.clientX, e.clientY)
  }

  function handlePointerMove(e: PointerEvent<HTMLDivElement>) {
    setCursor(containerPoint(e.clientX, e.clientY))
    if (!erasingRef.current || e.buttons !== 1) return
    eraseAt(e.clientX, e.clientY)
  }

  function handlePointerUp(e: PointerEvent<HTMLDivElement>) {
    try {
      ;(e.target as HTMLDivElement).releasePointerCapture(e.pointerId)
    } catch {
      // already released
    }
    erasingRef.current = false
    erasedIdsRef.current = new Set()
    snapshotTakenRef.current = false
    lastSpotFlowRef.current = null
  }

  function handlePointerLeave() {
    if (!erasingRef.current) setCursor(null)
  }

  return (
    <div
      className="freehand-overlay freehand-eraser-overlay"
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      onPointerLeave={handlePointerLeave}
    >
      {cursor && (
        <div
          className="pointer-events-none absolute rounded-full border border-gray-500/70 dark:border-gray-300/70"
          style={{
            left: cursor.x - tipDiameterPx / 2,
            top: cursor.y - tipDiameterPx / 2,
            width: tipDiameterPx,
            height: tipDiameterPx,
          }}
        />
      )}
    </div>
  )
}
