// Smart Draw — turn a pen stroke into a shape, a straight line, or a text candidate.
// Geometry only (no model). Text OCR happens later, and only when this says `text`.
// Shape ids match `components/shapes` SVGs, which are axis-aligned — tilted drawings stay ink.

export type SmartShape =
  | 'circle' // Ellipse in the stroke box (circle.tsx)
  | 'rectangle'
  | 'round-rectangle'
  | 'triangle' // Point-up only — matches triangle.tsx
  | 'diamond'
  | 'hexagon' // Flat top — matches hexagon.tsx
  | 'parallelogram'
  | 'plus'

export type Stroke = Array<[number, number] | [number, number, number]> // Flow samples; pressure optional

export type RecognizeResult =
  | { kind: 'line'; points: Array<[number, number, number]> } // Straight shaft, or shaft + arrow barbs
  | { kind: 'lines'; strokes: Array<Array<[number, number, number]>> } // Several straight strokes
  | { kind: 'shape'; shape: SmartShape; x: number; y: number; width: number; height: number }
  | { kind: 'text' } // Looks like handwriting — caller runs OCR
  | { kind: 'ink' } // Not close enough to any of the above

type Pt = { x: number; y: number }
type Box = { minX: number; minY: number; maxX: number; maxY: number; width: number; height: number }

const MIN_LEN = 22 // Shorter than this is a dot / tick — leave the blot
const LINE_WOBBLE = 0.075 // Mean drift / chord. Above this is a curve, not a line

function toPts(stroke: Stroke): Pt[] {
  return stroke.map((p) => ({ x: p[0], y: p[1] })) // Drop pressure; geometry is x/y only
}

function withPressure(pts: Pt[]): Array<[number, number, number]> {
  return pts.map((p) => [p.x, p.y, 1]) // Constant pressure — tip size lives on the node
}

function dist(a: Pt, b: Pt): number {
  return Math.hypot(a.x - b.x, a.y - b.y)
}

function bounds(pts: Pt[]): Box {
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const p of pts) {
    if (p.x < minX) minX = p.x
    if (p.y < minY) minY = p.y
    if (p.x > maxX) maxX = p.x
    if (p.y > maxY) maxY = p.y
  }
  return { minX, minY, maxX, maxY, width: Math.max(0, maxX - minX), height: Math.max(0, maxY - minY) }
}

function pathLength(pts: Pt[]): number {
  let len = 0
  for (let i = 1; i < pts.length; i++) len += dist(pts[i - 1], pts[i])
  return len
}

/** Evenly spaced samples so corner finding doesn’t depend on pointer rate. */
function resample(pts: Pt[], n: number): Pt[] {
  if (pts.length < 2) return pts
  const total = pathLength(pts)
  if (total < 1) return pts
  const step = total / (n - 1) // Distance between output samples
  const out: Pt[] = [pts[0]]
  let acc = 0
  let i = 1
  let prev = pts[0]
  while (out.length < n && i < pts.length) {
    const d = dist(prev, pts[i])
    if (acc + d >= step && d > 0) {
      const t = (step - acc) / d // Interpolate so spacing stays even
      const p = { x: prev.x + (pts[i].x - prev.x) * t, y: prev.y + (pts[i].y - prev.y) * t }
      out.push(p)
      prev = p
      acc = 0
    } else {
      acc += d
      prev = pts[i]
      i++
    }
  }
  while (out.length < n) out.push(pts[pts.length - 1]) // Pad if the path was shorter than `n`
  return out
}

function meanPerp(pts: Pt[], a: Pt, b: Pt): number {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const len = Math.hypot(dx, dy) || 1 // Avoid div-by-zero on a dot
  let sum = 0
  for (const p of pts) {
    sum += Math.abs((p.x - a.x) * dy - (p.y - a.y) * dx) / len // Distance to the infinite line
  }
  return sum / Math.max(1, pts.length)
}

/** Ends of the stroke along its long axis — ignores start/end hooks. */
function principalEnds(pts: Pt[]): [Pt, Pt] {
  let cx = 0
  let cy = 0
  for (const p of pts) {
    cx += p.x
    cy += p.y
  }
  cx /= pts.length
  cy /= pts.length
  let xx = 0
  let xy = 0
  let yy = 0
  for (const p of pts) {
    const dx = p.x - cx
    const dy = p.y - cy
    xx += dx * dx
    xy += dx * dy
    yy += dy * dy
  }
  const disc = Math.sqrt(Math.max(0, (xx - yy) * (xx - yy) + 4 * xy * xy))
  const l1 = (xx + yy + disc) / 2 // Largest eigenvalue of the covariance
  let vx = xy
  let vy = l1 - xx
  if (Math.hypot(vx, vy) < 1e-6) {
    vx = 1
    vy = 0 // Degenerate — treat as horizontal
  }
  const vlen = Math.hypot(vx, vy) || 1
  vx /= vlen
  vy /= vlen
  let minT = Infinity
  let maxT = -Infinity
  let minP = pts[0]
  let maxP = pts[0]
  for (const p of pts) {
    const t = (p.x - cx) * vx + (p.y - cy) * vy
    if (t < minT) {
      minT = t
      minP = p
    }
    if (t > maxT) {
      maxT = t
      maxP = p
    }
  }
  return [minP, maxP]
}

function isClosed(pts: Pt[], diag: number): boolean {
  if (pts.length < 4) return false
  const gap = dist(pts[0], pts[pts.length - 1])
  const tol = Math.max(22, diag * 0.34) // Loops rarely meet; a small gap still closes
  if (gap <= tol) return true
  const headN = Math.max(3, Math.floor(pts.length * 0.28))
  const end = pts[pts.length - 1]
  let near = Infinity
  for (let i = 0; i < headN; i++) near = Math.min(near, dist(pts[i], end))
  const tail = pts.slice(Math.floor(pts.length * 0.72))
  for (const p of tail) near = Math.min(near, dist(p, pts[0])) // End passes back over the start
  return near <= tol
}

function dp(pts: Pt[], eps: number): Pt[] {
  if (pts.length < 3) return pts.slice()
  const a = pts[0]
  const b = pts[pts.length - 1]
  const dx = b.x - a.x
  const dy = b.y - a.y
  const len = Math.hypot(dx, dy) || 1
  let maxD = 0
  let idx = 0
  for (let i = 1; i < pts.length - 1; i++) {
    const p = pts[i]
    const d = Math.abs((p.x - a.x) * dy - (p.y - a.y) * dx) / len
    if (d > maxD) {
      maxD = d
      idx = i
    }
  }
  if (maxD > eps) {
    const left = dp(pts.slice(0, idx + 1), eps)
    const right = dp(pts.slice(idx), eps)
    return left.slice(0, -1).concat(right) // Drop the shared corner so it isn’t doubled
  }
  return [a, b]
}

function dedupe(pts: Pt[], minSep: number): Pt[] {
  const out: Pt[] = []
  for (const p of pts) {
    if (out.length === 0 || dist(out[out.length - 1], p) > minSep) out.push(p)
  }
  if (out.length > 2 && dist(out[0], out[out.length - 1]) <= minSep) out.pop() // Closed duplicate
  return out
}

/** Interior angle at `cur` in degrees (180 = straight). */
function interiorAngle(prev: Pt, cur: Pt, next: Pt): number {
  const v1x = prev.x - cur.x
  const v1y = prev.y - cur.y
  const v2x = next.x - cur.x
  const v2y = next.y - cur.y
  const d1 = Math.hypot(v1x, v1y) || 1
  const d2 = Math.hypot(v2x, v2y) || 1
  const cos = Math.max(-1, Math.min(1, (v1x * v2x + v1y * v2y) / (d1 * d2)))
  return (Math.acos(cos) * 180) / Math.PI
}

function cornerAngles(corners: Pt[]): number[] {
  const n = corners.length
  const angs: number[] = []
  for (let i = 0; i < n; i++) {
    angs.push(interiorAngle(corners[(i - 1 + n) % n], corners[i], corners[(i + 1) % n]))
  }
  return angs
}

function cornersAt(pts: Pt[], diag: number, epsFrac: number): Pt[] {
  const sample = resample(pts, 64)
  const closed = isClosed(sample, diag)
  const eps = Math.max(5, diag * epsFrac)
  const minSep = Math.max(8, diag * 0.08)
  if (!closed) return dedupe(dp(sample, eps), minSep)
  // A closed loop’s start and end are the same point — DP against that chord sees nothing.
  // Split at the farthest sample so each half has a real chord.
  let far = 1
  let farD = 0
  for (let i = 1; i < sample.length; i++) {
    const d = dist(sample[i], sample[0])
    if (d > farD) {
      farD = d
      far = i
    }
  }
  const first = dp(sample.slice(0, far + 1), eps)
  const second = dp(sample.slice(far).concat([sample[0]]), eps)
  let simplified = first.slice(0, -1).concat(second)
  if (simplified.length > 1 && dist(simplified[0], simplified[simplified.length - 1]) <= eps) {
    simplified = simplified.slice(0, -1) // Drop the repeated start
  }
  return dedupe(simplified, minSep)
}

function shapeBox(shape: SmartShape, box: Box): RecognizeResult {
  const w = Math.max(28, box.width) // Tiny boxes read as dots, not shapes
  const h = Math.max(28, box.height)
  const cx = (box.minX + box.maxX) / 2
  const cy = (box.minY + box.maxY) / 2
  return { kind: 'shape', shape, x: cx - w / 2, y: cy - h / 2, width: w, height: h }
}

/** How much of a full turn the stroke covers. A "C" is ~200°; a circle is ~360°. */
function angleCoverage(pts: Pt[], center: Pt): number {
  const angs = pts
    .map((p) => Math.atan2(p.y - center.y, p.x - center.x))
    .sort((a, b) => a - b)
  if (angs.length < 3) return 0
  let maxGap = 0
  for (let i = 1; i < angs.length; i++) maxGap = Math.max(maxGap, angs[i] - angs[i - 1])
  maxGap = Math.max(maxGap, angs[0] + Math.PI * 2 - angs[angs.length - 1]) // Wrap-around gap
  return 360 - (maxGap * 180) / Math.PI
}

function edgeAngleDeg(a: Pt, b: Pt): number {
  return (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI
}

/** True when every edge is within `tol` degrees of horizontal or vertical. */
function axisAligned(corners: Pt[], tol = 18): boolean {
  const n = corners.length
  for (let i = 0; i < n; i++) {
    const ang = edgeAngleDeg(corners[i], corners[(i + 1) % n])
    const mod = ((ang % 90) + 90) % 90
    const off = Math.min(mod, 90 - mod) // 0 = on the grid, 45 = diagonal
    if (off > tol) return false
  }
  return true
}

function isDiamond(corners: Pt[], box: Box): boolean {
  if (corners.length !== 4) return false
  const mids = [
    { x: (box.minX + box.maxX) / 2, y: box.minY },
    { x: box.maxX, y: (box.minY + box.maxY) / 2 },
    { x: (box.minX + box.maxX) / 2, y: box.maxY },
    { x: box.minX, y: (box.minY + box.maxY) / 2 },
  ]
  const boxCorners = [
    { x: box.minX, y: box.minY },
    { x: box.maxX, y: box.minY },
    { x: box.maxX, y: box.maxY },
    { x: box.minX, y: box.maxY },
  ]
  const tol = Math.max(box.width, box.height) * 0.28
  let hits = 0
  for (const c of corners) {
    const dMid = Math.min(...mids.map((m) => dist(c, m)))
    const dCor = Math.min(...boxCorners.map((m) => dist(c, m)))
    if (dMid + 4 < dCor && dMid <= tol) hits++ // Near a side midpoint, not a box corner
  }
  return hits >= 3
}

/** Point-up triangle — the only silhouette triangle.tsx draws. */
function isPointUpTriangle(corners: Pt[], box: Box): boolean {
  if (corners.length !== 3) return false
  const apex = corners.reduce((a, b) => (a.y < b.y ? a : b))
  const base = corners.filter((c) => c !== apex)
  if (base.length !== 2) return false
  const midX = (box.minX + box.maxX) / 2
  if (Math.abs(apex.x - midX) > box.width * 0.28) return false // Apex must sit near top-center
  if (apex.y > box.minY + box.height * 0.28) return false
  const topBase = Math.min(base[0].y, base[1].y)
  if (topBase < box.minY + box.height * 0.55) return false // Base stays on the bottom
  const baseAng = Math.abs(edgeAngleDeg(base[0], base[1]))
  const off = Math.min(baseAng, 180 - baseAng)
  return off < 22 // Base roughly horizontal
}

function isFlatTopHex(corners: Pt[], box: Box): boolean {
  if (corners.length < 5 || corners.length > 6) return false
  const top = corners.filter((c) => c.y <= box.minY + box.height * 0.2)
  if (top.length < 2) return false // hexagon.tsx has a flat top edge
  const lengths: number[] = []
  for (let i = 0; i < corners.length; i++) {
    lengths.push(dist(corners[i], corners[(i + 1) % corners.length]))
  }
  const mean = lengths.reduce((s, n) => s + n, 0) / lengths.length
  if (mean < 8) return false
  const cv = Math.sqrt(lengths.reduce((s, n) => s + (n - mean) ** 2, 0) / lengths.length) / mean
  return cv < 0.45 // Roughly regular — a lumpy blob isn’t a hexagon
}

function isPlus(pts: Pt[], box: Box): boolean {
  if (box.width < 28 || box.height < 28) return false
  if (coversFourSides(pts, box)) return false // A box outline is not a plus
  const cx = (box.minX + box.maxX) / 2
  const cy = (box.minY + box.maxY) / 2
  const tolX = box.width * 0.16
  const tolY = box.height * 0.16
  const edge = 0.14
  let horiz = 0
  let vert = 0
  let other = 0
  let left = false
  let right = false
  let top = false
  let bottom = false
  for (const p of pts) {
    const onH = Math.abs(p.y - cy) <= tolY
    const onV = Math.abs(p.x - cx) <= tolX
    if (onH || onV) {
      if (onH) horiz++
      if (onV) vert++
    } else {
      other++
    }
    if ((p.x - box.minX) / box.width <= edge) left = true // Arm reaches the left edge
    if ((box.maxX - p.x) / box.width <= edge) right = true
    if ((p.y - box.minY) / box.height <= edge) top = true
    if ((box.maxY - p.y) / box.height <= edge) bottom = true
  }
  const n = pts.length || 1
  // Both arms, all four directions, and almost no points off the cross (kills wavy lines)
  return left && right && top && bottom && horiz / n > 0.35 && vert / n > 0.35 && other / n < 0.22
}

function coversFourSides(pts: Pt[], box: Box): boolean {
  if (box.width < 28 || box.height < 28) return false
  const tol = Math.max(5, 0.07 * Math.min(box.width, box.height))
  // A circle only kisses each side near the middle. A rectangle’s stroke runs the length of the side.
  const spanOf = (values: number[], size: number) => {
    if (values.length < 3 || size < 1) return 0
    const lo = Math.min(...values)
    const hi = Math.max(...values)
    return (hi - lo) / size
  }
  const top = pts.filter((p) => Math.abs(p.y - box.minY) <= tol).map((p) => p.x)
  const right = pts.filter((p) => Math.abs(p.x - box.maxX) <= tol).map((p) => p.y)
  const bottom = pts.filter((p) => Math.abs(p.y - box.maxY) <= tol).map((p) => p.x)
  const left = pts.filter((p) => Math.abs(p.x - box.minX) <= tol).map((p) => p.y)
  return (
    spanOf(top, box.width) > 0.72 &&
    spanOf(bottom, box.width) > 0.72 &&
    spanOf(left, box.height) > 0.72 &&
    spanOf(right, box.height) > 0.72
  )
}

function matchLine(pts: Pt[]): Pt[] | null {
  if (pts.length < 2) return null
  const [a, b] = principalEnds(pts)
  const chord = dist(a, b)
  if (chord < 20) return null
  const mean = meanPerp(pts, a, b)
  if (mean / chord > LINE_WOBBLE) return null // Too curved to call a line
  return [a, b]
}

/** Shaft plus two barbs when the last quarter leaves the line. */
function matchArrow(pts: Pt[]): Pt[] | null {
  if (pts.length < 8) return null
  const cut = Math.floor(pts.length * 0.72)
  const shaft = pts.slice(0, Math.max(4, cut))
  const line = matchLine(shaft)
  if (!line) return null
  const tipProbe = meanPerp(pts.slice(cut), line[0], line[1])
  if (tipProbe < 8) return null // No arrowhead — caller will keep the plain line
  const dirx = line[1].x - line[0].x
  const diry = line[1].y - line[0].y
  const dlen = Math.hypot(dirx, diry) || 1
  const ux = dirx / dlen
  const uy = diry / dlen
  let tip = pts[0]
  let maxT = -Infinity
  for (const p of pts) {
    const t = (p.x - line[0].x) * ux + (p.y - line[0].y) * uy
    if (t > maxT) {
      maxT = t
      tip = p // Farthest point along the shaft is the arrow tip
    }
  }
  const head = Math.max(14, dist(line[0], tip) * 0.22)
  const back = { x: tip.x - ux * head, y: tip.y - uy * head }
  const px = -uy
  const py = ux
  const left = { x: back.x + px * head * 0.45, y: back.y + py * head * 0.45 }
  const right = { x: back.x - px * head * 0.45, y: back.y - py * head * 0.45 }
  return [line[0], tip, left, tip, right] // Retrace through the tip so the stroke draws both barbs
}

function isWritingBox(box: Box): boolean {
  if (box.height < 14 || box.height > 280) return false // Taller than a word — not a letter
  if (box.width < 8 || box.width > 900) return false
  return true
}

/**
 * Oval / wobbly ring. Points are scaled into the stroke box first so a tall or wide
 * loop still looks circular (the circle shape is an ellipse in that box).
 * Flat sides (rectangle, hexagon) fail the “always turning” test.
 */
function isRoundLoop(pts: Pt[], box: Box, diag: number, closed: boolean): boolean {
  if (box.width < 22 || box.height < 22) return false
  const aspect = Math.min(box.width, box.height) / Math.max(box.width, box.height, 1)
  if (aspect < 0.3) return false // A squashed streak is a line, not a circle
  const cx = (box.minX + box.maxX) / 2
  const cy = (box.minY + box.maxY) / 2
  const sx = box.width / 2
  const sy = box.height / 2
  const rs = pts.map((p) => Math.hypot((p.x - cx) / sx, (p.y - cy) / sy))
  const mean = rs.reduce((s, r) => s + r, 0) / rs.length
  if (mean < 0.55) return false // Ink sits in the middle, not on a rim
  const variance = rs.reduce((s, r) => s + (r - mean) ** 2, 0) / rs.length
  if (Math.sqrt(variance) / mean > 0.24) return false // Rim jumps around after oval-normalizing

  const sample = resample(pts, 42)
  let smoothed = sample
  for (let pass = 0; pass < 2; pass++) {
    const next = [smoothed[0]]
    for (let i = 1; i < smoothed.length - 1; i++) {
      next.push({
        x: (smoothed[i - 1].x + smoothed[i].x * 2 + smoothed[i + 1].x) / 4, // Light smooth — kills pen jitter, keeps corners
        y: (smoothed[i - 1].y + smoothed[i].y * 2 + smoothed[i + 1].y) / 4,
      })
    }
    next.push(smoothed[smoothed.length - 1])
    smoothed = next
  }
  let tiny = 0
  let same = 0
  let sign = 0
  const steps = Math.max(1, smoothed.length - 2)
  for (let i = 1; i < smoothed.length - 1; i++) {
    const a = smoothed[i - 1]
    const b = smoothed[i]
    const c = smoothed[i + 1]
    const cross = (b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x)
    const dot = (b.x - a.x) * (c.x - b.x) + (b.y - a.y) * (c.y - b.y)
    const turn = (Math.atan2(cross, dot) * 180) / Math.PI // Degrees turned at this sample
    if (Math.abs(turn) < 7) tiny++ // Straight run — polygons have these, circles don’t
    if (Math.abs(turn) > 2) {
      const s = turn > 0 ? 1 : -1
      if (sign === 0) sign = s
      if (s === sign) same++
    }
  }
  if (tiny / steps > 0.55) return false // Long straight sides — polygon, not a circle
  if (same / steps < 0.22) return false // Reversed or scribbled, not one loop

  const cover = angleCoverage(pts, { x: cx, y: cy })
  if (cover < 210) return false // Open "C" stays ink
  if (!closed && cover < 255) return false // Gap too big to call it a circle
  return true
}

function matchShape(pts: Pt[], box: Box, diag: number, closed: boolean): RecognizeResult | null {
  if (box.width < 24 && box.height < 24) return null
  const four = coversFourSides(pts, box)
  // Round before polygons, but not when the ink actually runs along four sides (a box).
  if (!four && isRoundLoop(pts, box, diag, closed)) {
    return shapeBox('circle', box)
  }
  const corners = cornersAt(pts, diag, 0.08)
  const fine = cornersAt(pts, diag, 0.04) // Tight epsilon: rounded corners survive, sharp ones don’t multiply
  if (isPlus(pts, box)) return shapeBox('plus', box)
  if (corners.length === 3) {
    if (isPointUpTriangle(corners, box)) {
      const area =
        Math.abs(
          corners[0].x * (corners[1].y - corners[2].y) +
            corners[1].x * (corners[2].y - corners[0].y) +
            corners[2].x * (corners[0].y - corners[1].y),
        ) / 2
      if (area > 0.12 * box.width * box.height) return shapeBox('triangle', box)
    }
  }
  if (corners.length === 4 && (closed || coversFourSides(pts, box))) {
    if (isDiamond(corners, box)) return shapeBox('diamond', box)
    const angs = cornerAngles(corners)
    const right = angs.filter((a) => a > 68 && a < 112).length
    if (right >= 3 && axisAligned(corners)) {
      const rounded = fine.length >= corners.length + 3 // Extra bends = rounded corners, not jitter
      return shapeBox(rounded ? 'round-rectangle' : 'rectangle', box)
    }
    if (right < 3 && axisAligned(corners, 28)) return shapeBox('parallelogram', box)
  }
  if ((closed || coversFourSides(pts, box)) && isFlatTopHex(corners, box)) return shapeBox('hexagon', box)
  if (coversFourSides(pts, box)) return shapeBox('rectangle', box) // Sides drawn, corners a bit soft
  return null
}

/** One stroke → line, shape, text candidate, or leave it as ink. */
export function recognizeStroke(stroke: Stroke): RecognizeResult {
  const pts = toPts(stroke)
  if (pts.length < 3) return { kind: 'ink' }
  const box = bounds(pts)
  const diag = Math.hypot(box.width, box.height)
  const len = pathLength(pts)
  if (len < MIN_LEN || diag < 12) return { kind: 'ink' } // Dot blot
  const closed = isClosed(pts, diag)
  if (!closed) {
    const arrow = matchArrow(pts)
    if (arrow) return { kind: 'line', points: withPressure(arrow) }
    const line = matchLine(pts)
    if (line) return { kind: 'line', points: withPressure(line) }
  }
  const shape = matchShape(pts, box, diag, closed)
  if (shape) return shape
  if (isWritingBox(box) && len > 28) return { kind: 'text' } // Letter-sized and not a shape
  return { kind: 'ink' }
}

/**
 * A short burst of strokes (pen lifted, then continued).
 * One closed figure wins over per-stroke lines so a box drawn as four sides becomes a rectangle.
 * A word-sized cluster that isn’t a figure is text.
 */
export function recognizeCluster(strokes: Stroke[]): RecognizeResult {
  const usable = strokes.filter((s) => s.length >= 2)
  if (usable.length === 0) return { kind: 'ink' }
  if (usable.length === 1) return recognizeStroke(usable[0])
  const all = usable.flat()
  const pts = toPts(all)
  const box = bounds(pts)
  const diag = Math.hypot(box.width, box.height)
  const closed = isClosed(pts, diag) || coversFourSides(pts, box)
  const shape = matchShape(pts, box, diag, closed)
  if (shape && shape.kind === 'shape') return shape
  if (isWritingBox(box)) return { kind: 'text' } // "T", "H", a word — don’t straighten the strokes apart
  const lines = usable.map((s) => recognizeStroke(s)).filter((r) => r.kind === 'line')
  if (lines.length === usable.length) {
    return {
      kind: 'lines',
      strokes: lines.map((r) => (r.kind === 'line' ? r.points : [])),
    }
  }
  return { kind: 'ink' }
}

/** Gap between two stroke boxes. 0 if they overlap or touch. Used to split bursts. */
export function strokeGap(a: Stroke, b: Stroke): number {
  const A = bounds(toPts(a))
  const B = bounds(toPts(b))
  const gapX = A.maxX < B.minX ? B.minX - A.maxX : B.maxX < A.minX ? A.minX - B.maxX : 0
  const gapY = A.maxY < B.minY ? B.minY - A.maxY : B.maxY < A.minY ? A.minY - B.maxY : 0
  if (gapX === 0 && gapY === 0) return 0
  if (gapX === 0) return gapY
  if (gapY === 0) return gapX
  return Math.hypot(gapX, gapY)
}

/** Top-left of every point in the burst — where a text frame should sit. */
export function clusterOrigin(strokes: Stroke[]): { x: number; y: number } {
  const box = bounds(toPts(strokes.flat()))
  return { x: box.minX, y: box.minY }
}
