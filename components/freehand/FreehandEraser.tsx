// Eraser overlay for Draw mode — stroke deletes whole ink; spot punches circular holes in paint
import { useRef, useState, type PointerEvent } from 'react' // Capture erase gestures without RF pan
import { useReactFlow, type Node } from 'reactflow' // Flow coords + live freehand nodes
import { useReactFlowContext } from '@/components/react-flow-context' // eraserMode + tip size

import { DEFAULT_STROKE_SIZE, DEFAULT_ERASER_TIP_DIAMETER_PX, pathOptions } from './path' // Stroke width + default eraser tip
import type { Points } from './types' // [x, y, pressure] tuples on freehand nodes
import type { FreehandNodeData, FreehandNodeType } from './FreehandNode' // Node shape + eraseHoles

/** Squared distance from point P to segment AB (flow space). */
function dist2PointToSegment(
  px: number, // Eraser tip x
  py: number, // Eraser tip y
  ax: number, // Segment start x
  ay: number, // Segment start y
  bx: number, // Segment end x
  by: number, // Segment end y
) {
  const dx = bx - ax // Segment vector x
  const dy = by - ay // Segment vector y
  const len2 = dx * dx + dy * dy // Squared length
  if (len2 === 0) {
    const ex = px - ax
    const ey = py - ay
    return ex * ex + ey * ey
  }
  let t = ((px - ax) * dx + (py - ay) * dy) / len2 // Project onto segment
  t = Math.max(0, Math.min(1, t)) // Clamp to AB
  const qx = ax + t * dx
  const qy = ay + t * dy
  const ex = px - qx
  const ey = py - qy
  return ex * ex + ey * ey
}

type FreehandData = FreehandNodeData // Alias for size helpers

/** Resolve AABB + content box for hit tests / hole math. */
function freehandSize(node: Node) {
  const data = node.data as FreehandData | undefined
  const initialW = data?.initialSize?.width ?? 0
  const initialH = data?.initialSize?.height ?? 0
  const aabbW = (node.width as number | undefined) ?? initialW
  const aabbH = (node.height as number | undefined) ?? initialH
  const rotation = typeof data?.rotation === 'number' ? data.rotation : 0
  // Upright: RF box is the content box (same as FreehandNode.resolveContentSize)
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
  const lx = localX * scaleX - contentW / 2 // Content-local, origin at center
  const ly = localY * scaleY - contentH / 2
  if (Math.abs(rotation) <= 0.5) {
    return { x: nodeX + localX * scaleX, y: nodeY + localY * scaleY } // Upright: AABB = content
  }
  const rad = (rotation * Math.PI) / 180
  const c = Math.cos(rad)
  const s = Math.sin(rad)
  return {
    x: nodeX + aabbW / 2 + lx * c - ly * s,
    y: nodeY + aabbH / 2 + lx * s + ly * c,
  }
}

/** Absolute flow → authored local (inverse of localToFlow). */
function flowToLocal(
  flowX: number,
  flowY: number,
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
  if (Math.abs(rotation) <= 0.5) {
    return {
      x: scaleX > 0 ? (flowX - nodeX) / scaleX : 0,
      y: scaleY > 0 ? (flowY - nodeY) / scaleY : 0,
    }
  }
  const rad = (-rotation * Math.PI) / 180 // Inverse rotate
  const c = Math.cos(rad)
  const s = Math.sin(rad)
  const dx = flowX - (nodeX + aabbW / 2)
  const dy = flowY - (nodeY + aabbH / 2)
  const lx = dx * c + dy * s // R^T · d
  const ly = -dx * s + dy * c
  return {
    x: scaleX > 0 ? (lx + contentW / 2) / scaleX : 0,
    y: scaleY > 0 ? (ly + contentH / 2) / scaleY : 0,
  }
}

/** True when the eraser tip hits this freehand stroke (stroke mode / punch gate). */
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

/** True when every centerline sample’s paint disk is covered by erase holes. */
function strokeFullyErased(
  points: Points,
  strokeSize: number,
  holes: { x: number; y: number; r: number }[],
) {
  if (holes.length === 0 || points.length === 0) return false
  const paintR = strokeSize * 0.5
  for (const [px, py] of points) {
    let covered = false
    for (const h of holes) {
      // Paint disk around sample covered when hole reaches the far side of the stamp
      if (Math.hypot(px - h.x, py - h.y) + paintR <= h.r + 0.5) {
        covered = true
        break
      }
    }
    if (!covered) return false
  }
  return true
}

export type SpotEraseMutation = {
  removeIds: string[] // Fully erased strokes
  upsertNodes: FreehandNodeType[] // Same-id strokes with new eraseHoles
}

/**
 * Punch a circular hole matching the tip — evenodd erase, not centerline split.
 * Returns null when the tip does not overlap this stroke’s paint.
 */
function spotPunchHole(
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
  const scale = Math.min(scaleX, scaleY) || 1
  const local = flowToLocal(
    flowX,
    flowY,
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
  const rLocal = radiusFlow / scale // Tip radius in authored space
  if (!(rLocal > 0)) return null

  const prevHoles = Array.isArray(data?.eraseHoles) ? data!.eraseHoles! : []
  const nextHoles = [...prevHoles, { x: local.x, y: local.y, r: rLocal }]
  const strokeSize = typeof data?.strokeSize === 'number' ? data.strokeSize : DEFAULT_STROKE_SIZE

  if (strokeFullyErased(points, strokeSize, nextHoles)) {
    return { removeIds: [node.id], upsertNodes: [] }
  }

  const nextData: FreehandNodeData = {
    ...(data as FreehandNodeData),
    eraseHoles: nextHoles,
  }
  const upsert: FreehandNodeType = {
    ...(node as FreehandNodeType),
    data: nextData,
  }
  return { removeIds: [], upsertNodes: [upsert] }
}

/**
 * Full-board overlay while Draw → Eraser is armed.
 * Stroke mode removes whole freehand nodes; spot mode punches tip-sized holes in paint.
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
  const { eraserMode, eraserTipSize } = useReactFlowContext() // Flavor + tip from Draw bar
  const { screenToFlowPosition, getNodes, getViewport, setNodes } = useReactFlow()
  const erasingRef = useRef(false) // Primary button held
  const erasedIdsRef = useRef(new Set<string>()) // Stroke mode: already deleted this gesture
  const snapshotTakenRef = useRef(false) // One undo step per drag
  const lastSpotFlowRef = useRef<{ x: number; y: number } | null>(null) // Densify punches along the drag
  const [cursor, setCursor] = useState<{ x: number; y: number } | null>(null) // Tip preview
  const tipDiameterPx = eraserTipSize || DEFAULT_ERASER_TIP_DIAMETER_PX // Thickness bar → screen tip
  const tipRadiusPx = tipDiameterPx / 2 // Stroke erase + spot punch radius in screen px

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
   * Punch every freehand stroke under one or more tip samples (densified drag).
   * Accumulates holes in-memory so React setNodes races don’t drop punches.
   */
  function punchSamples(samples: { x: number; y: number }[], radiusFlow: number) {
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
        const punched = spotPunchHole(node, sample.x, sample.y, radiusFlow)
        if (!punched) continue
        if (punched.removeIds.length > 0) {
          removeIds.push(...punched.removeIds)
          liveById.delete(id)
          upsertById.delete(id)
          continue
        }
        const next = punched.upsertNodes[0]
        if (next) {
          liveById.set(id, next)
          upsertById.set(id, next)
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
    const zoom = getViewport().zoom || 1
    const radiusFlow = tipRadiusPx / zoom
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
    const zoom = getViewport().zoom || 1
    const radiusFlow = tipRadiusPx / zoom // Thickness bar tip; zoom scales punch in board space
    const prev = lastSpotFlowRef.current
    lastSpotFlowRef.current = { x, y }
    const samples: { x: number; y: number }[] = []
    if (prev) {
      // Stamp overlapping tip disks so a drag leaves a continuous tunnel
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
    punchSamples(samples, radiusFlow)
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
    lastSpotFlowRef.current = null // Fresh densify baseline for this gesture
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
