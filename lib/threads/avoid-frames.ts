// Unbent Smooth and Sharp threads detour around frames they are not attached to.
// Linear stays the direct line. Manual bends (edge.data.points) are left alone by the caller.

import { Position, type Node, type XYPosition } from 'reactflow' // Sides + flow points
import {
  sampleSmoothThreadBezier,
  connectionDirection,
  clampArrowHead,
  type SmoothThreadBezier,
} from '@/components/threads/path/bezier' // Same cubic family as an unbent smooth thread
import { readFrameChromePad } from '@/lib/frame-chrome-offset' // Selection gutter — the fill, not the adjust box, is the obstacle

/** Flow px the stroke stays outside a frame it is routing around. */
const LANE_GAP = 28

/** How far the stroke travels straight out of a connection point before it may turn. */
const STUB = 18

/** A centerline this close to a frame edge still counts as crossing it. */
const DETECT_PAD = 1

/** One frame the router may route around. */
export type FrameObstacle = {
  id: string // RF node id — endpoints are skipped by id
  x: number // Flow left of the frame box
  y: number // Flow top of the frame box
  w: number // Flow width
  h: number // Flow height
  onThread: { sourceMessageId: string; targetMessageId: string } | null // Set when this frame is anchored on a thread
}

/** A detour that replaces the direct stroke. Null means the direct stroke is clear. */
export type ThreadDetour = {
  path: string // SVG `d` for the stroke, already shortened for the arrow
  mid: XYPosition // Hollow knob — middle of the longest clear run
}

type SideName = 'low' | 'high' // low = smaller flow coord (above, or to the left)

/** Read the on-thread anchor pair without importing the placement module (that imports geometry). */
function onThreadPair(node: Node): FrameObstacle['onThread'] {
  const meta = (node.data as { promptMessage?: { metadata?: { onThread?: { sourceMessageId?: unknown; targetMessageId?: unknown } } } } | undefined)
    ?.promptMessage?.metadata // Frame metadata bag
  const raw = meta?.onThread // Anchor, when this frame sits on a thread
  if (!raw || typeof raw.sourceMessageId !== 'string' || typeof raw.targetMessageId !== 'string') return null // Not on a thread
  return { sourceMessageId: raw.sourceMessageId, targetMessageId: raw.targetMessageId } // Pair the router can match
}

/** Message id for a frame node, used to keep that thread's own on-thread frames on the stroke. */
export function frameMessageId(node?: Node | null): string | null {
  const id = (node?.data as { promptMessage?: { id?: string } } | undefined)?.promptMessage?.id // Persisted message id
  return typeof id === 'string' ? id : null // Ignore missing ids
}

/** Axis-aligned frame boxes. One walk per node-map snapshot; every thread on that snapshot shares it. */
const obstacleCache = new WeakMap<Map<string, Node>, FrameObstacle[]>()

/** Frame boxes for a live RF node map. Same map reference returns the same array. */
export function snapshotFrameObstacles(nodes: Map<string, Node>): FrameObstacle[] {
  const hit = obstacleCache.get(nodes) // This store snapshot was already measured
  if (hit) return hit // Every other thread this frame is free
  const boxes = frameObstaclesFromNodes(nodes.values()) // First subscriber pays for the walk
  obstacleCache.set(nodes, boxes) // Hold until RF drops this map
  return boxes
}

/** Frame boxes from any node list (settled edges, on-thread placement). */
export function frameObstaclesFromNodes(nodes: Iterable<Node>): FrameObstacle[] {
  const boxes: FrameObstacle[] = [] // Frames the stroke should try not to cross
  for (const n of nodes) {
    if (n.type !== 'chatPanel' || n.hidden) continue // Drawings and shapes are not frames
    const pad = readFrameChromePad(n.data) // 0 unless this frame is selected
    const x = (n.positionAbsolute?.x ?? n.position.x) + pad.x // Fill left — chrome shifts the RF origin
    const y = (n.positionAbsolute?.y ?? n.position.y) + pad.y // Fill top
    const w = (n.width ?? 0) - pad.x * 2 // Fill width, so selecting a frame doesn't shove nearby threads
    const h = (n.height ?? 0) - pad.y * 2 // Fill height
    if (w < 2 || h < 2) continue // Not laid out yet — nothing to route around
    boxes.push({ id: n.id, x, y, w, h, onThread: onThreadPair(n) }) // One obstacle
  }
  return boxes
}

/** True when this frame is anchored on the thread being routed (it belongs on the stroke). */
function anchoredHere(
  o: FrameObstacle, // Candidate frame
  sourceId: string, // Thread source node id
  targetId: string, // Thread target node id
  srcMsg: string | null, // Source message id
  tgtMsg: string | null // Target message id
): boolean {
  if (o.id === sourceId || o.id === targetId) return true // The frames this thread is attached to
  if (!o.onThread || !srcMsg || !tgtMsg) return false // A normal frame, or we can't match the pair
  const a = o.onThread.sourceMessageId // Anchor source
  const b = o.onThread.targetMessageId // Anchor target
  return (a === srcMsg && b === tgtMsg) || (a === tgtMsg && b === srcMsg) // Either direction
}

/** Segment vs axis-aligned rect. Boundary contact counts as a hit. */
function segmentHitsRect(
  a: XYPosition, // Segment start
  b: XYPosition, // Segment end
  o: FrameObstacle, // Frame box
  pad: number // Extra flow px around the box
): boolean {
  const x0 = o.x - pad // Expanded left
  const y0 = o.y - pad // Expanded top
  const x1 = o.x + o.w + pad // Expanded right
  const y1 = o.y + o.h + pad // Expanded bottom
  let t0 = 0 // Entry parameter along the segment
  let t1 = 1 // Exit parameter
  const dx = b.x - a.x // Segment X
  const dy = b.y - a.y // Segment Y
  const p = [-dx, dx, -dy, dy] // Liang-Barsky clip planes
  const q = [a.x - x0, x1 - a.x, a.y - y0, y1 - a.y] // Distances to those planes
  for (let i = 0; i < 4; i++) {
    if (p[i] === 0) {
      if (q[i] < 0) return false // Parallel and outside this edge
    } else {
      const r = q[i] / p[i] // Hit parameter on this plane
      if (p[i] < 0) {
        if (r > t1) return false // Enters after it already exited
        if (r > t0) t0 = r // Later entry
      } else {
        if (r < t0) return false // Exits before it enters
        if (r < t1) t1 = r // Earlier exit
      }
    }
  }
  return t0 <= t1 // Some of the segment lies inside the box
}

/** True when any segment of the polyline crosses the frame. */
function polylineHits(pts: XYPosition[], o: FrameObstacle, pad: number): boolean {
  for (let i = 0; i < pts.length - 1; i++) {
    if (segmentHitsRect(pts[i], pts[i + 1], o, pad)) return true // This run crosses the frame
  }
  return false
}

/** Point a short distance outside a connection point, along the side the thread uses. */
function outward(p: XYPosition, side: Position, dist: number): XYPosition {
  if (side === Position.Left) return { x: p.x - dist, y: p.y } // Leave left
  if (side === Position.Right) return { x: p.x + dist, y: p.y } // Leave right
  if (side === Position.Top) return { x: p.x, y: p.y - dist } // Leave up
  return { x: p.x, y: p.y + dist } // Leave down
}

/** Shorten the exit stub so it stops before the first frame it would enter. */
function clampedOutward(
  origin: XYPosition, // Connection point
  side: Position, // Side the stub follows
  blocked: FrameObstacle[] // Frames the stub must not enter
): XYPosition {
  const full = outward(origin, side, STUB) // Preferred stub
  if (!blocked.some((o) => segmentHitsRect(origin, full, o, 0))) return full // The gap is wide enough
  let lo = 0 // Last distance that stayed clear
  let hi = STUB // A distance that hits
  let best = origin // Fall back to the connection point if even a short stub hits
  for (let i = 0; i < 8; i++) {
    const mid = (lo + hi) / 2 // Try halfway
    const p = outward(origin, side, mid) // Candidate stub end
    if (blocked.some((o) => segmentHitsRect(origin, p, o, 0))) hi = mid // Still inside — shorten
    else {
      best = p // This length is clear
      lo = mid // See if a longer stub also fits
    }
  }
  return best
}

/** True when a vertical line at this X would pass through a frame. */
function insideX(x: number, blocked: FrameObstacle[]): boolean {
  return blocked.some((o) => x > o.x && x < o.x + o.w) // Strict so the edge itself is a legal column
}

/** True when a horizontal line at this Y would pass through a frame. */
function insideY(y: number, blocked: FrameObstacle[]): boolean {
  return blocked.some((o) => y > o.y && y < o.y + o.h) // Strict so the edge itself is a legal row
}

/** Slide a column out of any frame it landed in, without stepping back into the attached frame. */
function escapeX(x: number, blocked: FrameObstacle[], originX: number, side: Position): number {
  if (!insideX(x, blocked)) return x // Already in a gap
  let best = x // Stay put if every escape is worse
  let bestD = Infinity // Distance of that escape
  for (const o of blocked) {
    if (x <= o.x || x >= o.x + o.w) continue // This frame isn't the one we're inside
    const cands = [o.x - 1, o.x + o.w + 1] // Just outside its left and right edges
    for (const cand of cands) {
      if (side === Position.Right && cand < originX - 0.5) continue // Left of a right-side point re-enters that frame
      if (side === Position.Left && cand > originX + 0.5) continue // Right of a left-side point re-enters that frame
      if (insideX(cand, blocked)) continue // Another frame occupies that column
      const d = Math.abs(cand - x) // Prefer the nearer edge
      if (d < bestD) {
        bestD = d
        best = cand
      }
    }
  }
  return best
}

/** Slide a row out of any frame it landed in, without stepping back into the attached frame. */
function escapeY(y: number, blocked: FrameObstacle[], originY: number, side: Position): number {
  if (!insideY(y, blocked)) return y // Already in a gap
  let best = y // Stay put if every escape is worse
  let bestD = Infinity // Distance of that escape
  for (const o of blocked) {
    if (y <= o.y || y >= o.y + o.h) continue // This frame isn't the one we're inside
    const cands = [o.y - 1, o.y + o.h + 1] // Just outside its top and bottom edges
    for (const cand of cands) {
      if (side === Position.Bottom && cand < originY - 0.5) continue // Above a bottom-side point re-enters that frame
      if (side === Position.Top && cand > originY + 0.5) continue // Below a top-side point re-enters that frame
      if (insideY(cand, blocked)) continue // Another frame occupies that row
      const d = Math.abs(cand - y) // Prefer the nearer edge
      if (d < bestD) {
        bestD = d
        best = cand
      }
    }
  }
  return best
}

/** Drop near-duplicates and points that sit on a straight run between their neighbors. */
function dedupe(points: XYPosition[]): XYPosition[] {
  const out: XYPosition[] = [] // Kept corners
  for (const p of points) {
    const prev = out[out.length - 1] // Previous kept point
    if (prev && Math.hypot(p.x - prev.x, p.y - prev.y) < 0.5) continue // Same spot
    if (out.length >= 2) {
      const a = out[out.length - 2] // Point before the previous
      const b = prev // The previous kept point
      const abx = b.x - a.x // Incoming run X
      const aby = b.y - a.y // Incoming run Y
      const bpx = p.x - b.x // Outgoing run X
      const bpy = p.y - b.y // Outgoing run Y
      const cross = abx * bpy - aby * bpx // ~0 when the three points are colinear
      if (Math.abs(cross) < 0.5 && abx * bpx + aby * bpy > 0) {
        out[out.length - 1] = p // Extend the straight run instead of adding a corner
        continue
      }
    }
    out.push(p) // A real corner
  }
  return out
}

/** Pull the last point back along the final segment so the arrow tip can finish the stroke. */
function insetEnd(pts: XYPosition[], head: number): XYPosition[] {
  if (head <= 0 || pts.length < 2) return pts // Nothing to reserve for the arrow
  const a = pts[pts.length - 2] // Point before the tip
  const b = pts[pts.length - 1] // Connection point the arrow lands on
  const len = Math.hypot(b.x - a.x, b.y - a.y) || 1 // Length of the last run
  const cut = Math.min(head, len * 0.72) // Same cap as the smooth cubic — leave some stroke
  const ux = (b.x - a.x) / len // Unit toward the tip
  const uy = (b.y - a.y) / len
  const next = pts.slice(0, -1) // All but the tip
  next.push({ x: b.x - ux * cut, y: b.y - uy * cut }) // Stroke ends on the back of the arrow
  return next
}

/** Polyline with a quadratic fillet at each corner so the turn stays outside the frames. */
function roundedPolyline(points: XYPosition[], radius: number): string {
  if (points.length === 0) return '' // Nothing to paint
  if (points.length === 1) return `M${points[0].x},${points[0].y}` // A dot
  if (points.length === 2 || radius <= 0) {
    let d = `M${points[0].x},${points[0].y}` // Start
    for (let i = 1; i < points.length; i++) d += `L${points[i].x},${points[i].y}` // Straight runs (Linear)
    return d
  }
  let d = `M${points[0].x},${points[0].y}` // Start at the connection point
  for (let i = 1; i < points.length - 1; i++) {
    const prev = points[i - 1] // Incoming
    const cur = points[i] // Corner
    const next = points[i + 1] // Outgoing
    const inLen = Math.hypot(cur.x - prev.x, cur.y - prev.y) || 1 // Incoming length
    const outLen = Math.hypot(next.x - cur.x, next.y - cur.y) || 1 // Outgoing length
    const r = Math.min(radius, inLen / 2, outLen / 2) // Fillet can't eat the whole run
    const inUx = (cur.x - prev.x) / inLen // Incoming unit
    const inUy = (cur.y - prev.y) / inLen
    const outUx = (next.x - cur.x) / outLen // Outgoing unit
    const outUy = (next.y - cur.y) / outLen
    const a = { x: cur.x - inUx * r, y: cur.y - inUy * r } // Where the curve leaves the straight run
    const b = { x: cur.x + outUx * r, y: cur.y + outUy * r } // Where the straight run resumes
    d += `L${a.x},${a.y}Q${cur.x},${cur.y} ${b.x},${b.y}` // Line, then a corner that cuts away from the frame
  }
  const last = points[points.length - 1] // Back of the arrow, or the target
  d += `L${last.x},${last.y}` // Finish
  return d
}

/** Middle of the longest run — the hollow knob sits on the lane, not in a frame. */
function longestMid(pts: XYPosition[]): XYPosition {
  let best = 0 // Longest run so far
  let mid = pts[0] ?? { x: 0, y: 0 } // Fallback if the polyline is empty
  for (let i = 0; i < pts.length - 1; i++) {
    const len = Math.hypot(pts[i + 1].x - pts[i].x, pts[i + 1].y - pts[i].y) // This run
    if (len > best) {
      best = len
      mid = { x: (pts[i].x + pts[i + 1].x) / 2, y: (pts[i].y + pts[i + 1].y) / 2 } // On the stroke
    }
  }
  return mid
}

/** Waypoints that leave the source, travel a clear lane, and arrive at the target. */
function lanePoints(
  source: XYPosition, // Source connection point
  target: XYPosition, // Target connection point
  fromSide: Position, // Side the thread leaves
  toSide: Position, // Side the thread arrives
  blocked: FrameObstacle[], // Frames this lane must clear
  which: SideName, // Which side of those frames
  horizontal: boolean, // Lane is constant-Y when the thread is mostly horizontal
  gap: number // How far outside the frames the lane sits
): XYPosition[] {
  const exit = clampedOutward(source, fromSide, blocked) // Stub that doesn't enter a neighbor
  const enter = clampedOutward(target, toSide, blocked) // Stub on the arrival side
  if (horizontal) {
    const laneY =
      which === 'low'
        ? Math.min(...blocked.map((o) => o.y)) - gap // Above the frames (flow Y grows downward)
        : Math.max(...blocked.map((o) => o.y + o.h)) + gap // Below the frames
    const spanLo = Math.min(...blocked.map((o) => o.x)) - gap // Just before the frames
    const spanHi = Math.max(...blocked.map((o) => o.x + o.w)) + gap // Just after the frames
    const goingRight = target.x >= source.x // Chord direction
    // Jog only beside the frames. A long empty stretch stays on the original line.
    let riseX = goingRight ? spanLo : spanHi // Near side of the cluster
    if (goingRight && exit.x > riseX) riseX = exit.x // Stub is already inside the span — rise there
    if (!goingRight && exit.x < riseX) riseX = exit.x
    let dropX = goingRight ? spanHi : spanLo // Far side of the cluster
    if (goingRight && enter.x < dropX) dropX = enter.x // Arrival stub is still inside the span
    if (!goingRight && enter.x > dropX) dropX = enter.x
    riseX = escapeX(riseX, blocked, source.x, fromSide) // Don't rise through a frame
    dropX = escapeX(dropX, blocked, target.x, toSide) // Don't drop through a frame
    return dedupe([
      source, // Connection point
      exit, // Out along the source side
      { x: riseX, y: exit.y }, // Straight until the frames
      { x: riseX, y: laneY }, // Out to the lane
      { x: dropX, y: laneY }, // Along the lane, clear of the frames
      { x: dropX, y: enter.y }, // Back to the arrival line
      enter, // Arrival stub
      target, // Connection point the arrow finishes
    ])
  }
  const laneX =
    which === 'low'
      ? Math.min(...blocked.map((o) => o.x)) - gap // Left of the frames
      : Math.max(...blocked.map((o) => o.x + o.w)) + gap // Right of the frames
  const spanLo = Math.min(...blocked.map((o) => o.y)) - gap // Just before the frames
  const spanHi = Math.max(...blocked.map((o) => o.y + o.h)) + gap // Just after the frames
  const goingDown = target.y >= source.y // Chord direction (flow Y grows downward)
  let riseY = goingDown ? spanLo : spanHi // Near side of the cluster
  if (goingDown && exit.y > riseY) riseY = exit.y // Stub is already inside the span
  if (!goingDown && exit.y < riseY) riseY = exit.y
  let dropY = goingDown ? spanHi : spanLo // Far side of the cluster
  if (goingDown && enter.y < dropY) dropY = enter.y
  if (!goingDown && enter.y > dropY) dropY = enter.y
  riseY = escapeY(riseY, blocked, source.y, fromSide) // Don't turn through a frame
  dropY = escapeY(dropY, blocked, target.y, toSide)
  return dedupe([
    source,
    exit,
    { x: exit.x, y: riseY }, // Straight until the frames
    { x: laneX, y: riseY }, // Out to the lane
    { x: laneX, y: dropY }, // Along the lane
    { x: enter.x, y: dropY }, // Back to the arrival line
    enter,
    target,
  ])
}

/** How a detour is drawn. Smooth is the default thread; Sharp keeps elbows. Linear never detours. */
export type ThreadDetourShape = 'smooth' | 'sharp' | 'linear'

/** Bow onto the clear side of the frames, on the same curve a normal thread would use. */
function bowCubic(
  source: XYPosition, // Source connection point
  target: XYPosition, // Target connection point
  cluster: FrameObstacle[], // Frames this bow must clear
  which: SideName, // Which side of those frames
  horizontal: boolean, // Bow is vertical when the thread runs mostly sideways
  gap: number, // How far past the frames the middle of the curve sits
  head: number, // Flow px reserved for the arrow
  fromSide: Position, // Side the thread leaves
  toSide: Position, // Side the arrow enters
  fan: number // Extra flow px further out, so a neighbor's bow does not sit on this one
): { path: string; mid: XYPosition; hits: (frames: FrameObstacle[]) => number; extras: (frames: FrameObstacle[], cluster: FrameObstacle[]) => FrameObstacle[] } {
  const inn = connectionDirection(toSide) // Into the target side — perpendicular to that edge
  const leave = connectionDirection(fromSide) // Into the source side; the stroke leaves the other way
  const out = { x: -leave.x, y: -leave.y } // Straight out of the source side
  const span = Math.hypot(target.x - source.x, target.y - source.y) || 1 // Chord length
  const cut = clampArrowHead(head, span) // Same cap as an unbent smooth thread
  const end = { x: target.x - inn.x * cut, y: target.y - inn.y * cut } // Stroke ends on the back of the arrow
  const lane = horizontal
    ? which === 'low'
      ? Math.min(...cluster.map((o) => o.y)) - gap // Above the frames
      : Math.max(...cluster.map((o) => o.y + o.h)) + gap // Below the frames
    : which === 'low'
      ? Math.min(...cluster.map((o) => o.x)) - gap // Left of the frames
      : Math.max(...cluster.map((o) => o.x + o.w)) + gap // Right of the frames
  const laneOut = lane + (which === 'low' ? -fan : fan) // Neighboring bow sits one lane further out
  const lanePt = horizontal
    ? { x: (source.x + end.x) / 2, y: laneOut } // Where the middle should sit
    : { x: laneOut, y: (source.y + end.y) / 2 }
  const handle = Math.min(360, Math.max(72, span * 0.5)) // Same handle scale as an unbent smooth thread
  const c1 = { x: source.x + out.x * handle, y: source.y + out.y * handle } // On the source side
  const c2 = { x: end.x - inn.x * handle, y: end.y - inn.y * handle } // On the arrival side
  const natural = cubicAt(source, c1, c2, end, 0.5) // Middle of that normal curve
  const dx = lanePt.x - natural.x // How far the lane sits off the normal curve
  const dy = lanePt.y - natural.y
  const dist = Math.hypot(dx, dy) // Size of the ease
  const built = dist < 0.5
    ? { path: `M${source.x},${source.y} C${c1.x},${c1.y} ${c2.x},${c2.y} ${end.x},${end.y}`, samples: cubicSamples(source, c1, c2, end), mid: natural }
    : displaceSmooth(source, c1, c2, end, dx / dist, dy / dist, dist) // Same curve, middle eased onto the lane
  const crossed = (frames: FrameObstacle[]) => {
    const hit: FrameObstacle[] = [] // Frames this bow still enters
    const samples = built.samples // The perpendicular path, not a diagonal cubic
    for (const o of frames) {
      for (let i = 0; i < samples.length - 1; i++) {
        if (segmentHitsRect(samples[i], samples[i + 1], o, 0)) {
          hit.push(o) // A step of the curve is inside the frame
          break
        }
      }
    }
    return hit
  }
  return {
    path: built.path, // The normal curve, middle eased aside
    mid: built.mid, // Knob on that curve
    hits: (frames) => crossed(frames).length,
    extras: (frames, group) => crossed(frames).filter((o) => !group.includes(o)),
  }
}

/** SVG for a Sharp or Linear detour. Smooth bows are a single cubic from `bowCubic`. */
function detourPath(pts: XYPosition[], shape: ThreadDetourShape): string {
  if (shape === 'sharp') return roundedPolyline(pts, 8) // Ridged corners
  return roundedPolyline(pts, 0) // Linear — straight runs
}

/** How many of these frames the polyline still crosses. */
function hitCount(pts: XYPosition[], frames: FrameObstacle[]): number {
  let n = 0 // Frames still in the way
  for (const o of frames) if (polylineHits(pts, o, 0)) n += 1 // Pad 0 — the lane is already LANE_GAP out
  return n
}

/** Polyline length, used to pick the shorter clear side. */
function polyLength(pts: XYPosition[]): number {
  let n = 0 // Sum of runs
  for (let i = 0; i < pts.length - 1; i++) n += Math.hypot(pts[i + 1].x - pts[i].x, pts[i + 1].y - pts[i].y)
  return n
}

/**
 * Route an unbent Smooth or Sharp thread around frames it is not attached to.
 * Linear returns null so the stroke stays the straight line between the connection points.
 * Returns null when the direct stroke (and the Smooth bow, if sampled) misses every other frame,
 * or when neither side reduces how many frames get crossed.
 */
export function routeThreadAroundFrames(args: {
  source: XYPosition // Source connection point
  target: XYPosition // Target connection point or free-end center
  fromSide: Position // Side the thread leaves
  toSide: Position // Side the thread arrives
  sourceId: string // Attached source — not an obstacle
  targetId: string // Attached target — not an obstacle
  sourceMessageId?: string | null // So this thread's on-thread frames stay on the stroke
  targetMessageId?: string | null
  obstacles: FrameObstacle[] // Every frame box on the board
  head?: number // Flow px the stroke stops short of the target
  shape?: ThreadDetourShape // Smooth unless the thread is Sharp or Linear
  sampleSmooth?: boolean // Also test the Smooth cubic, which can bow off the chord
  ignoreIds?: string[] // Extra frames to leave alone (the frame the pointer is aiming at)
  fan?: number // Extra flow px past the clear lane so this bow misses neighboring threads
}): ThreadDetour | null {
  if (args.shape === 'linear') return null // Linear is the chord — it crosses frames it is not attached to
  const srcMsg = args.sourceMessageId ?? null // May be missing on shapes
  const tgtMsg = args.targetMessageId ?? null
  const ignore = new Set(args.ignoreIds ?? []) // Preview excludes the frame under the pointer
  const relevant = args.obstacles.filter(
    (o) => !ignore.has(o.id) && !anchoredHere(o, args.sourceId, args.targetId, srcMsg, tgtMsg)
  ) // Frames this stroke is allowed to treat as obstacles
  if (relevant.length === 0) return null // Nothing else on the board
  if (Math.hypot(args.target.x - args.source.x, args.target.y - args.source.y) < 2) return null // Zero-length drag
  const probes: Array<[XYPosition, XYPosition]> = [[args.source, args.target]] // The chord
  if (args.sampleSmooth) {
    const samples = sampleSmoothThreadBezier(
      {
        sourceX: args.source.x,
        sourceY: args.source.y,
        sourcePosition: args.fromSide,
        targetX: args.target.x,
        targetY: args.target.y,
        targetPosition: args.toSide,
        head: args.head, // Sample the stroke, not the arrow tip inside the target
      },
      12
    )
    for (let i = 0; i < samples.length - 1; i++) probes.push([samples[i], samples[i + 1]]) // Each step of the bow
  }
  const blocked = relevant.filter((o) => probes.some(([a, b]) => segmentHitsRect(a, b, o, DETECT_PAD))) // Frames the direct stroke crosses
  if (blocked.length === 0) return null // Direct stroke is clear — keep the existing curve
  const shape = args.shape ?? 'smooth' // Default threads are smooth; Sharp and Linear opt out
  const horizontal = Math.abs(args.target.x - args.source.x) >= Math.abs(args.target.y - args.source.y) // Lane axis
  let cluster = blocked.slice() // Grows if the detour would cross frames the chord missed
  let best: { pts: XYPosition[]; hits: number; len: number; path?: string; mid?: XYPosition } | null = null
  for (let pass = 0; pass < 4; pass++) {
    const fan = shape === 'smooth' ? 0 : (args.fan ?? 0) // Sharp and Linear push the whole lane out
    const gap = LANE_GAP + pass * (shape === 'smooth' ? 22 : 16) + fan // A higher bow if the first curve still clips
    const sides: SideName[] = ['low', 'high'] // Above/left, then below/right
    const trial: Array<{ pts: XYPosition[]; hits: number; len: number; extras: FrameObstacle[]; path?: string; mid?: XYPosition }> = []
    for (const which of sides) {
      if (shape === 'smooth') {
        const bow = bowCubic(
          args.source,
          args.target,
          cluster,
          which,
          horizontal,
          gap,
          args.head ?? 0,
          args.fromSide, // Leave perpendicular to this side
          args.toSide, // Enter perpendicular to this side
          args.fan ?? 0 // One lane further out than the neighbor that shares this side
        )
        trial.push({
          pts: [args.source, bow.mid, args.target], // Stand-in for the length comparison
          hits: bow.hits(relevant), // Samples of the one cubic
          len: Math.hypot(bow.mid.x - args.source.x, bow.mid.y - args.source.y) + Math.hypot(args.target.x - bow.mid.x, args.target.y - bow.mid.y),
          extras: bow.extras(relevant, cluster),
          path: bow.path, // The cubic itself
          mid: bow.mid, // Knob on the bow
        })
        continue
      }
      const pts = lanePoints(args.source, args.target, args.fromSide, args.toSide, cluster, which, horizontal, gap)
      trial.push({
        pts,
        hits: hitCount(pts, relevant),
        len: polyLength(pts),
        extras: relevant.filter((o) => !cluster.includes(o) && polylineHits(pts, o, 0)),
      })
    }
    trial.sort((a, b) => a.hits - b.hits || a.len - b.len) // Fewer crossings, then the shorter walk
    const winner = trial[0]
    if (!best || winner.hits < best.hits || (winner.hits === best.hits && winner.len < best.len)) {
      best = winner // Remember the best attempt even if a later pass can't finish
    }
    if (winner.hits === 0) {
      best = winner // Clear — stop pushing
      break
    }
    const grow = trial.flatMap((t) => t.extras) // Frames to include so the next pass goes around them too
    let added = false // Whether the cluster grew
    for (const g of grow) {
      if (!cluster.includes(g)) {
        cluster.push(g) // Widen the union
        added = true
      }
    }
    if (!added && shape !== 'smooth') break // A larger gap only helps the smooth bow
  }
  if (!best || best.hits >= blocked.length) return null // Detour didn't reduce conflicts — keep the direct stroke
  if (best.path && best.mid) return { path: best.path, mid: best.mid } // One cubic, already clear of the frames
  const drawn = insetEnd(best.pts, args.head ?? 0) // Sharp / Linear reserve the arrow on the polyline
  return {
    path: detourPath(drawn, shape),
    mid: longestMid(drawn), // Knob on the clear run
  }
}

/** Point on a cubic at `t`. */
function cubicAt(p0: XYPosition, c1: XYPosition, c2: XYPosition, p3: XYPosition, t: number): XYPosition {
  const u = 1 - t // Bernstein complement
  return {
    x: u * u * u * p0.x + 3 * u * u * t * c1.x + 3 * u * t * t * c2.x + t * t * t * p3.x,
    y: u * u * u * p0.y + 3 * u * u * t * c1.y + 3 * u * t * t * c2.y + t * t * t * p3.y,
  }
}

/** dP/dt of a cubic. At the ends this is the side the thread meets. */
function cubicDeriv(p0: XYPosition, c1: XYPosition, c2: XYPosition, p3: XYPosition, t: number): XYPosition {
  const u = 1 - t // Bernstein complement
  return {
    x: 3 * u * u * (c1.x - p0.x) + 6 * u * t * (c2.x - c1.x) + 3 * t * t * (p3.x - c2.x),
    y: 3 * u * u * (c1.y - p0.y) + 6 * u * t * (c2.y - c1.y) + 3 * t * t * (p3.y - c2.y),
  }
}

/** Interior slopes of a uniform clamped spline. Ends are already known. */
function splineSlopes(values: number[], start: number, end: number): number[] {
  const n = values.length - 1 // Segment count
  const m = new Array<number>(n + 1).fill(0) // Slope at each sample
  m[0] = start // Matches the normal thread at the start
  m[n] = end // Matches it at the arrival
  const count = n - 1 // Unknown interior slopes
  if (count <= 0) return m
  const lower = new Array<number>(count).fill(0) // Coefficient of the previous slope
  const diag = new Array<number>(count).fill(4) // Coefficient of this slope
  const upper = new Array<number>(count).fill(0) // Coefficient of the next slope
  const rhs = new Array<number>(count).fill(0) // Right-hand side
  for (let k = 0; k < count; k++) {
    const i = k + 1 // Sample index of this unknown
    rhs[k] = 3 * (values[i + 1] - values[i - 1]) // Uniform-knot spline equation
    if (i === 1) rhs[k] -= start // First known slope
    if (i === n - 1) rhs[k] -= end // Last known slope
    if (k > 0) lower[k] = 1 // Couples to the previous unknown
    if (k < count - 1) upper[k] = 1 // Couples to the next unknown
  }
  for (let k = 1; k < count; k++) {
    const w = lower[k] / diag[k - 1] // Eliminate the lower coefficient
    diag[k] -= w * upper[k - 1]
    rhs[k] -= w * rhs[k - 1]
  }
  const solved = new Array<number>(count).fill(0) // Interior slopes
  solved[count - 1] = rhs[count - 1] / diag[count - 1] // Back-substitution
  for (let k = count - 2; k >= 0; k--) solved[k] = (rhs[k] - upper[k] * solved[k + 1]) / diag[k]
  for (let k = 0; k < count; k++) m[k + 1] = solved[k] // Write them back
  return m
}

/**
 * The normal smooth cubic, with the middle eased off by `mag` along (nx, ny).
 * Ends stay on that cubic, so the angle at each frame matches a thread that was not moved.
 */
function displaceSmooth(
  p0: XYPosition, // Start of the normal curve
  c1: XYPosition, // Leave handle
  c2: XYPosition, // Arrive handle
  p3: XYPosition, // End of the normal curve
  nx: number, // Unit ease direction X
  ny: number, // Unit ease direction Y
  mag: number // How far the middle moves; ends stay put
): { path: string; samples: XYPosition[]; mid: XYPosition } {
  const n = 8 // Samples of the eased curve
  const pts: XYPosition[] = [] // Points the spline passes through
  for (let i = 0; i <= n; i++) {
    const t = i / n // Same parameter as the normal cubic
    const p = cubicAt(p0, c1, c2, p3, t) // Where a normal thread would be
    const w = Math.sin(Math.PI * t) ** 2 // 0 at both frames, 1 in the middle, flat tangent at the ends
    pts.push({ x: p.x + nx * mag * w, y: p.y + ny * mag * w }) // Ease aside without moving the tips
  }
  const d0 = cubicDeriv(p0, c1, c2, p3, 0) // Normal thread's departure
  const d1 = cubicDeriv(p0, c1, c2, p3, 1) // Normal thread's arrival
  const mx = splineSlopes(pts.map((p) => p.x), d0.x / n, d1.x / n) // X slopes, ends locked
  const my = splineSlopes(pts.map((p) => p.y), d0.y / n, d1.y / n) // Y slopes, ends locked
  let path = `M${pts[0].x},${pts[0].y}` // Start on the connection point
  for (let i = 0; i < n; i++) {
    const a = { x: pts[i].x + mx[i] / 3, y: pts[i].y + my[i] / 3 } // Hermite handle, same tangent
    const b = { x: pts[i + 1].x - mx[i + 1] / 3, y: pts[i + 1].y - my[i + 1] / 3 } // Into the next sample
    path += ` C${a.x},${a.y} ${b.x},${b.y} ${pts[i + 1].x},${pts[i + 1].y}` // One smooth piece
  }
  return { path, samples: pts, mid: pts[n / 2] } // Middle sample is the peak of the ease
}

/** How many of these frames the samples still cross. Source and target frames are ignored. */
function sampleHitCount(samples: XYPosition[], frames: FrameObstacle[], sourceId: string, targetId: string): number {
  let n = 0 // Frames the stroke still enters
  for (const o of frames) {
    if (o.id === sourceId || o.id === targetId) continue // The frames this thread is attached to
    for (let i = 0; i < samples.length - 1; i++) {
      if (segmentHitsRect(samples[i], samples[i + 1], o, 0)) {
        n += 1 // This step is inside the frame
        break
      }
    }
  }
  return n
}

/** Samples of one cubic, including both ends. */
function cubicSamples(p0: XYPosition, c1: XYPosition, c2: XYPosition, p3: XYPosition): XYPosition[] {
  const pts: XYPosition[] = [] // Even steps
  for (let s = 0; s <= 12; s++) pts.push(cubicAt(p0, c1, c2, p3, s / 12))
  return pts
}

/**
 * Ease the middle of a normal smooth thread onto its lane.
 * The tips stay on that thread, so the curve and the angle at each frame stay the ones a thread already has.
 * If the ease would enter more frames than the unshifted curve, use a smaller shift.
 */
export function smoothSpreadClear(
  curve: SmoothThreadBezier, // Unshifted smooth stroke
  spread: { offset: number; nx: number; ny: number }, // Lane from `threadSpread`
  frames: FrameObstacle[], // Frames the shifted curve should try not to enter
  sourceId: string, // Attached source
  targetId: string // Attached target
): SmoothThreadBezier {
  if (!curve.p0 || !curve.c1 || !curve.c2 || !curve.p3) return curve // Nothing to bow
  if (Math.abs(spread.offset) < 0.5) return curve // Already in its own lane
  const p0 = curve.p0 // Connection point the stroke leaves
  const c1 = curve.c1 // Leave handle — its direction is the source side
  const c2 = curve.c2 // Arrive handle — its direction is the arrow axis
  const p3 = curve.p3 // Back of the arrow
  const baseSamples = cubicSamples(p0, c1, c2, p3) // The unshifted stroke
  const baseHits = sampleHitCount(baseSamples, frames, sourceId, targetId) // Frames it already crosses
  const paint = (mag: number): { curve: SmoothThreadBezier; samples: XYPosition[] } => {
    const built = displaceSmooth(p0, c1, c2, p3, spread.nx, spread.ny, mag) // Same curve, middle eased aside
    return {
      curve: {
        path: built.path,
        mid: built.mid, // Knob on the eased curve
        p0,
        c1, // Leave direction unchanged
        c2,
        p3, // Arrival direction unchanged
      },
      samples: built.samples,
    }
  }
  let mag = spread.offset // Full lane first
  let best = curve // Keep the direct curve if every bow is worse
  let bestHits = baseHits
  for (let i = 0; i < 4; i++) {
    const next = paint(mag) // Try this lane
    const hits = sampleHitCount(next.samples, frames, sourceId, targetId)
    if (hits <= bestHits) {
      best = next.curve // No extra frames
      bestHits = hits
      if (hits === 0) return next.curve // Clear — stop shrinking
    }
    mag *= 0.5 // A smaller bow if this one entered a frame
  }
  return best
}
