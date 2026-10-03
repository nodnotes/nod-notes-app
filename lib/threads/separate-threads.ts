// Unbent threads that run alongside each other take neighboring lanes.
// Manual bends are left out — that route belongs to the user.

import { Position, type Edge, type Node, type XYPosition } from 'reactflow' // Corridor ends live in flow space
import { connectionPointOnNode, sideFromHandleId } from '@/components/threads/connection-point-on-node' // Same attach point the stroke uses
import { threadTipCenter } from '@/components/threads/path/bezier' // Free-end center, not a side handle

/** Preferred flow px between two strokes that would otherwise sit on each other. */
const SEP = 16

/** Widest the whole bundle is allowed to grow, so a crowd of threads stays near the chord. */
const BUNDLE = 96

/** Midpoints closer than this (flow px) still count as the same lane. */
const CLOSE = 18

/** Shared run, in flow px, before two threads are asked to separate. */
const MIN_OVERLAP = 40

/** |dot| of the two directions. Below this they cross instead of running together. */
const PARALLEL = 0.92

/** One unbent thread reduced to the segment its stroke follows. */
export type ThreadCorridor = {
  id: string // RF edge id
  source: XYPosition // Connection point the stroke leaves
  target: XYPosition // Connection point or free-end center it arrives at
}

/** How far to slide this stroke off its chord so it keeps a gap from its neighbors. */
export type ThreadSpread = {
  offset: number // Signed flow px along (nx, ny). 0 stays on the chord.
  nx: number // Unit normal X
  ny: number // Unit normal Y
  rank: number // 0 = first lane when a detour fans outward
  sep: number // Spacing used for this bundle
  count: number // Threads in the bundle, including this one
}

/** No neighbor close enough to move for. */
export const NO_SPREAD: ThreadSpread = { offset: 0, nx: 0, ny: -1, rank: 0, sep: SEP, count: 1 }

type Axis = { ux: number; uy: number; nx: number; ny: number } // Unit along + unit to the left of that

/** Point the axis so every parallel thread shares one normal. */
function canon(dx: number, dy: number): Axis {
  let x = dx // Copy so we can flip
  let y = dy
  if (x < 0 || (Math.abs(x) < 1e-9 && y < 0)) {
    x = -x // Face +X, or +Y when the run is vertical
    y = -y
  }
  const len = Math.hypot(x, y) || 1 // Keep a zero-length drag from dividing
  const ux = x / len // Along the run
  const uy = y / len
  return { ux, uy, nx: -uy, ny: ux } // Left of the canonical direction
}

/** Signed distance of a point from `origin` along the normal. */
function sideOf(p: XYPosition, origin: XYPosition, n: Axis): number {
  return (p.x - origin.x) * n.nx + (p.y - origin.y) * n.ny // + sits on the normal side
}

/** Parameter of a point along the canonical axis. */
function along(p: XYPosition, origin: XYPosition, n: Axis): number {
  return (p.x - origin.x) * n.ux + (p.y - origin.y) * n.uy // Projection
}

/** Midpoint of a corridor — where the gap is measured. */
function mid(c: ThreadCorridor): XYPosition {
  return { x: (c.source.x + c.target.x) / 2, y: (c.source.y + c.target.y) / 2 }
}

/** True when the two strokes would share a long stretch of the same lane. */
function alongside(a: ThreadCorridor, b: ThreadCorridor): boolean {
  const ax = a.target.x - a.source.x // A's run
  const ay = a.target.y - a.source.y
  const bx = b.target.x - b.source.x // B's run
  const by = b.target.y - b.source.y
  const la = Math.hypot(ax, ay) || 1 // A's length
  const lb = Math.hypot(bx, by) || 1 // B's length
  const dot = (ax * bx + ay * by) / (la * lb) // 1 = same way, -1 = opposite
  if (Math.abs(dot) < PARALLEL) return false // They cross; crossing is fine
  const n = canon(ax, ay) // Shared normal
  if (Math.abs(sideOf(mid(b), a.source, n)) > CLOSE) return false // Already in another lane
  const a0 = along(a.source, a.source, n) // A's span on that axis
  const a1 = along(a.target, a.source, n)
  const b0 = along(b.source, a.source, n) // B's span on A's axis
  const b1 = along(b.target, a.source, n)
  const overlap = Math.min(Math.max(a0, a1), Math.max(b0, b1)) - Math.max(Math.min(a0, a1), Math.min(b0, b1))
  if (overlap < MIN_OVERLAP) return false // They only meet at an end
  const shorter = Math.min(Math.abs(a1 - a0), Math.abs(b1 - b0)) // Don't separate a brief pass
  return overlap >= shorter * 0.28
}

/** Lane spacing for a bundle of this size. A crowd uses a tighter gap so it stays near the chord. */
function bundleSep(count: number): number {
  if (count <= 1) return SEP // Nothing to separate
  return Math.min(SEP, BUNDLE / (count - 1)) // Whole fan stays inside BUNDLE
}

/**
 * Signed midpoint shift for `id` among these corridors.
 * The same inputs always pick the same lane, so threads do not swap while the board pans.
 */
export function threadSpread(id: string, corridors: ThreadCorridor[]): ThreadSpread {
  const self = corridors.find((c) => c.id === id) // This stroke
  if (!self) return NO_SPREAD // Bent, or not measured yet
  const bundle = corridors.filter((c) => c.id === id || alongside(self, c)) // Self plus neighbors
  if (bundle.length < 2) return NO_SPREAD // Alone in this lane
  const ref = bundle.reduce((best, c) => (c.id < best.id ? c : best)) // Stable reference line
  const n = canon(ref.target.x - ref.source.x, ref.target.y - ref.source.y) // Normal everyone shares
  const ranked = bundle
    .map((c) => ({ id: c.id, dist: sideOf(mid(c), ref.source, n) })) // Where each chord already sits
    .sort((a, b) => a.dist - b.dist || (a.id < b.id ? -1 : 1)) // Near side first, then id
  const index = ranked.findIndex((r) => r.id === id) // This thread's slot
  const sep = bundleSep(bundle.length) // Gap between slots
  const desired = (index - (bundle.length - 1) / 2) * sep // Center the bundle on the reference
  const mine = ranked[index]?.dist ?? 0 // Where this chord sits now
  const offset = Math.max(-BUNDLE, Math.min(BUNDLE, desired - mine)) // Move onto that slot
  return { offset, nx: n.nx, ny: n.ny, rank: index, sep, count: bundle.length }
}

/**
 * Where a drag preview should sit so it does not cover threads already on the board.
 * Settled threads keep the lanes `threadSpread` gave them.
 */
export function spreadAlongside(self: ThreadCorridor, settled: ThreadCorridor[]): ThreadSpread {
  const near = settled.filter((c) => alongside(self, c)) // Strokes this drag would cover
  if (near.length === 0) return NO_SPREAD // Empty lane
  const ref = near.reduce((best, c) => (c.id < best.id ? c : best)) // Same normal as that neighbor
  const n = canon(ref.target.x - ref.source.x, ref.target.y - ref.source.y)
  const painted = near.map((c) => {
    const s = threadSpread(c.id, settled) // Lane that stroke already uses
    const at = mid(c) // Its chord middle
    const moved = { x: at.x + s.nx * s.offset, y: at.y + s.ny * s.offset } // Where the curve actually is
    return sideOf(moved, ref.source, n) // In the shared frame
  })
  const natural = sideOf(mid(self), ref.source, n) // Where this drag wants to be
  const sep = Math.min(SEP, BUNDLE / near.length) // One more lane
  const candidates: number[] = [] // Slots just beside each settled stroke
  for (const p of painted) {
    candidates.push(p + sep) // One side
    candidates.push(p - sep) // The other
  }
  let best = natural // Fall back to the chord
  let bestScore = Infinity // Distance from the natural line
  for (const c of candidates) {
    const gap = Math.min(...painted.map((p) => Math.abs(p - c))) // Clearance from the nearest stroke
    if (gap < sep * 0.85) continue // Still on top of someone
    const score = Math.abs(c - natural) // Prefer the slot nearest the pointer's line
    if (score < bestScore) {
      bestScore = score
      best = c
    }
  }
  if (bestScore === Infinity) {
    const hi = Math.max(...painted) // Outside the whole bundle
    const lo = Math.min(...painted)
    const up = hi + sep
    const down = lo - sep
    best = Math.abs(up - natural) <= Math.abs(down - natural) ? up : down // Nearer outside edge
  }
  const offset = Math.max(-BUNDLE, Math.min(BUNDLE, best - natural)) // Shift off the chord
  return { offset, nx: n.nx, ny: n.ny, rank: near.length, sep, count: near.length + 1 }
}

/** Corridors for every unbent thread. Bent threads are skipped. */
export function threadCorridorsFrom(nodes: Iterable<Node>, edges: Edge[]): ThreadCorridor[] {
  const byId = new Map<string, Node>() // Node lookup for the edge endpoints
  for (const n of nodes) byId.set(n.id, n)
  const out: ThreadCorridor[] = [] // One entry per unbent thread
  for (const e of edges) {
    if (!e.source || !e.target || e.type === 'placeholder') continue // Not a real thread
    const pts = (e.data as { points?: unknown[] } | undefined)?.points // Manual bends
    if (pts && pts.length > 0) continue // The user placed that route
    const src = byId.get(e.source) // Frame or tip the thread leaves
    const tgt = byId.get(e.target) // Frame or tip it arrives at
    if (!src || !tgt || src.hidden || tgt.hidden) continue // Not on the board
    const from = sideFromHandleId(e.sourceHandle, Position.Right) ?? Position.Right // Leave side
    const to = sideFromHandleId(e.targetHandle, Position.Left) ?? Position.Left // Arrive side
    const source = src.type === 'threadTip' ? threadTipCenter(src) : connectionPointOnNode(src, from)
    const target = tgt.type === 'threadTip' ? threadTipCenter(tgt) : connectionPointOnNode(tgt, to)
    if (!source || !target) continue // Node not measured yet
    if (Math.hypot(target.x - source.x, target.y - source.y) < 2) continue // Nothing to separate
    out.push({ id: e.id, source, target }) // This stroke's chord
  }
  return out
}

const corridorCache = new WeakMap<Map<string, Node>, { edges: Edge[]; corridors: ThreadCorridor[] }>() // One walk per store snapshot

/** Shared corridor list. Same node map and edge array returns the same reference. */
export function snapshotThreadCorridors(nodes: Map<string, Node>, edges: Edge[]): ThreadCorridor[] {
  const hit = corridorCache.get(nodes) // This snapshot was already measured
  if (hit && hit.edges === edges) return hit.corridors // Pan and zoom do not rebuild it
  const corridors = threadCorridorsFrom(nodes.values(), edges) // First subscriber pays for the walk
  corridorCache.set(nodes, { edges, corridors }) // Hold until RF drops the map
  return corridors
}
