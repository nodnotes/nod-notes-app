// Frame-as-shape helpers — a frame can wear a silhouette (circle, diamond, …)
// without becoming a separate RF `shape` node. Pages still own deep hierarchy;
// shape is on-page composition. See CONTEXT.md + DEFINITIONS.md.

import { ShapeComponents, type ShapeType } from '@/components/shapes/types' // Shared silhouette registry

/** All silhouettes a frame (or nested frame) may wear. */
export type FrameShapeType = ShapeType

/** Menu / search: “no silhouette” — current transparent text frame. */
export const FRAME_SHAPE_NONE = 'none' as const

/** Shape picker value: none or a registered silhouette. */
export type FrameShapeChoice = typeof FRAME_SHAPE_NONE | FrameShapeType

/** Ordered list for the frame-menu shape grid (matches Draw toolbar shapes). */
export const FRAME_SHAPE_TYPES: FrameShapeType[] = Object.keys(
  ShapeComponents
) as FrameShapeType[]

/** Human label for a shape choice (menu titles / a11y). */
export function frameShapeLabel(choice: FrameShapeChoice): string {
  if (choice === FRAME_SHAPE_NONE) return 'Default' // No SVG silhouette
  return choice.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()) // Title-case kebab ids
}

/** True when `value` is a registered silhouette id. */
export function isFrameShapeType(value: unknown): value is FrameShapeType {
  return typeof value === 'string' && value in ShapeComponents // Registry membership
}

/** Parse metadata / attrs into a silhouette, or null when unset / default. */
export function parseFrameShape(value: unknown): FrameShapeType | null {
  if (value == null || value === '' || value === FRAME_SHAPE_NONE) return null // Default frame
  return isFrameShapeType(value) ? value : null // Ignore unknown legacy strings
}

/** Default box when applying a silhouette so the outline is readable. */
export const FRAME_SHAPE_DEFAULT_SIZE = { width: 180, height: 140 } as const

/** Minimum box while a silhouette is active (still free-resizeable). */
export const FRAME_SHAPE_MIN_SIZE = { width: 72, height: 56 } as const

/** Axis-aligned box of a w×h rectangle rotated by `deg` (around center). */
export function rotatedRectAabbSize(
  w: number,
  h: number,
  deg: number
): { width: number; height: number } {
  const rad = (deg * Math.PI) / 180
  const c = Math.abs(Math.cos(rad))
  const s = Math.abs(Math.sin(rad))
  return { width: w * c + h * s, height: w * s + h * c }
}

/** Tight AABB of an ellipse filling w×h, rotated by `deg`. */
function rotatedEllipseAabbSize(
  w: number,
  h: number,
  deg: number
): { width: number; height: number } {
  const rad = (deg * Math.PI) / 180
  const c = Math.cos(rad)
  const s = Math.sin(rad)
  const a = Math.max(1, w) / 2
  const b = Math.max(1, h) / 2
  // Extents of rotated ellipse: 2√(a²cos²θ + b²sin²θ), 2√(a²sin²θ + b²cos²θ)
  return {
    width: 2 * Math.sqrt(a * a * c * c + b * b * s * s),
    height: 2 * Math.sqrt(a * a * s * s + b * b * c * c),
  }
}

/** AABB of polygon vertices (centered at origin) after rotation. */
function aabbOfRotatedPoints(
  points: Array<{ x: number; y: number }>,
  deg: number
): { width: number; height: number } {
  const rad = (deg * Math.PI) / 180
  const c = Math.cos(rad)
  const s = Math.sin(rad)
  let minX = Infinity
  let maxX = -Infinity
  let minY = Infinity
  let maxY = -Infinity
  for (const p of points) {
    const x = p.x * c - p.y * s
    const y = p.x * s + p.y * c
    if (x < minX) minX = x
    if (x > maxX) maxX = x
    if (y < minY) minY = y
    if (y > maxY) maxY = y
  }
  return { width: Math.max(1, maxX - minX), height: Math.max(1, maxY - minY) }
}

/** Unit-box polygon for a silhouette (0..1), converted to centered px via w/h. */
function shapeUnitPoints(type: FrameShapeType): Array<{ x: number; y: number }> | null {
  // Coordinates in 0..1 box (top-left origin), matching frameShapeClipCss polygons
  switch (type) {
    case 'diamond':
      return [
        { x: 0.5, y: 0 },
        { x: 1, y: 0.5 },
        { x: 0.5, y: 1 },
        { x: 0, y: 0.5 },
      ]
    case 'triangle':
      return [
        { x: 0.5, y: 0 },
        { x: 1, y: 1 },
        { x: 0, y: 1 },
      ]
    case 'hexagon':
      return [
        { x: 0.1, y: 0 },
        { x: 0.9, y: 0 },
        { x: 1, y: 0.5 },
        { x: 0.9, y: 1 },
        { x: 0.1, y: 1 },
        { x: 0, y: 0.5 },
      ]
    case 'parallelogram':
      return [
        { x: 0.25, y: 0 },
        { x: 1, y: 0 },
        { x: 0.75, y: 1 },
        { x: 0, y: 1 },
      ]
    case 'arrow-rectangle':
      return [
        { x: 0, y: 0 },
        { x: 0.9, y: 0 },
        { x: 1, y: 0.5 },
        { x: 0.9, y: 1 },
        { x: 0, y: 1 },
      ]
    case 'plus':
      return [
        { x: 0.33, y: 0 },
        { x: 0.67, y: 0 },
        { x: 0.67, y: 0.33 },
        { x: 1, y: 0.33 },
        { x: 1, y: 0.67 },
        { x: 0.67, y: 0.67 },
        { x: 0.67, y: 1 },
        { x: 0.33, y: 1 },
        { x: 0.33, y: 0.67 },
        { x: 0, y: 0.67 },
        { x: 0, y: 0.33 },
        { x: 0.33, y: 0.33 },
      ]
    default:
      return null
  }
}

/**
 * Upright AABB that tightly fits the visible silhouette after rotation.
 * Ellipse / circle / polygon shapes are tighter than the content rectangle;
 * default / round-rect fall back to the rectangle AABB.
 */
export function rotatedFrameAabbSize(
  w: number,
  h: number,
  deg: number,
  shape?: FrameShapeType | null
): { width: number; height: number } {
  if (!shape || Math.abs(deg) < 0.5) {
    return rotatedRectAabbSize(w, h, deg)
  }
  if (shape === 'circle') {
    return rotatedEllipseAabbSize(w, h, deg)
  }
  if (shape === 'cylinder') {
    // Soft stadium-like clip — ellipse is a close upright bound
    return rotatedEllipseAabbSize(w, h, deg)
  }
  const unit = shapeUnitPoints(shape)
  if (unit) {
    const pts = unit.map((p) => ({
      x: (p.x - 0.5) * w,
      y: (p.y - 0.5) * h,
    }))
    return aabbOfRotatedPoints(pts, deg)
  }
  // rectangle / round-rectangle / unknown — content box corners
  return rotatedRectAabbSize(w, h, deg)
}

/**
 * CSS `clip-path` so TipTap content stays inside the silhouette.
 * Returns undefined when clipping isn’t needed (default / hard-to-express shapes).
 */
/** Ray-cast point-in-polygon (unit coords, top-left origin). */
function pointInPolygon(x: number, y: number, polygon: Array<{ x: number; y: number }>): boolean {
  let inside = false
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].x
    const yi = polygon[i].y
    const xj = polygon[j].x
    const yj = polygon[j].y
    const hit = yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi
    if (hit) inside = !inside
  }
  return inside
}

/** True when (x,y) in 0..1 lies inside the silhouette clip (matches frameShapeClipCss). */
function pointInShapeUnit(x: number, y: number, shape: FrameShapeType): boolean {
  switch (shape) {
    case 'rectangle':
      return x >= 0 && x <= 1 && y >= 0 && y <= 1
    case 'round-rectangle':
      // inset(0 round 12px) — conservative inset so text clears rounded corners
      return x >= 0.06 && x <= 0.94 && y >= 0.06 && y <= 0.94
    case 'circle':
      return (x - 0.5) ** 2 + (y - 0.5) ** 2 <= 0.25
    case 'cylinder':
      // inset(8% 0 round 40%)
      return x >= 0 && x <= 1 && y >= 0.08 && y <= 0.92
    default: {
      const pts = shapeUnitPoints(shape)
      return pts ? pointInPolygon(x, y, pts) : x >= 0 && x <= 1 && y >= 0 && y <= 1
    }
  }
}

/** True when a centered contentW×contentH rect fits inside shape boxW×boxH. */
function contentFitsInShapeBox(
  boxW: number,
  boxH: number,
  contentW: number,
  contentH: number,
  shape: FrameShapeType
): boolean {
  if (boxW < 1 || boxH < 1) return false
  const hw = contentW / (2 * boxW)
  const hh = contentH / (2 * boxH)
  const cx = 0.5
  const cy = 0.5
  const corners = [
    { x: cx - hw, y: cy - hh },
    { x: cx + hw, y: cy - hh },
    { x: cx + hw, y: cy + hh },
    { x: cx - hw, y: cy + hh },
  ]
  return corners.every((p) => pointInShapeUnit(p.x, p.y, shape))
}

/**
 * Minimum frame box so centered content fits inside the silhouette (fit-to-text).
 * Free-resize (unlocked) frames keep the caller’s box — only inflate when hugging.
 */
export function inflateBoxForShapeContent(
  shape: FrameShapeType,
  contentW: number,
  contentH: number
): { width: number; height: number } {
  const cw = Math.max(1, contentW)
  const ch = Math.max(1, contentH)
  if (shape === 'rectangle' || contentFitsInShapeBox(cw, ch, cw, ch, shape)) {
    return { width: cw, height: ch }
  }
  let lo = 1
  let hi = 16
  while (hi - lo > 0.005) {
    const mid = (lo + hi) / 2
    if (contentFitsInShapeBox(cw * mid, ch * mid, cw, ch, shape)) hi = mid
    else lo = mid
  }
  const k = hi + 0.04 // Pad past the fit threshold so glyphs clear complex silhouettes (plus, diamond, …)
  return {
    width: Math.max(FRAME_SHAPE_MIN_SIZE.width, Math.ceil(cw * k)),
    height: Math.max(FRAME_SHAPE_MIN_SIZE.height, Math.ceil(ch * k)),
  }
}

/** Apply silhouette inflation when the frame is locked (fit to text). */
export function shapeFitContentBox(
  intrinsic: { width: number; height: number },
  shape: FrameShapeType | null | undefined,
  fitToText: boolean
): { width: number; height: number } {
  if (!shape || !fitToText) return intrinsic
  return inflateBoxForShapeContent(shape, intrinsic.width, intrinsic.height)
}

export function frameShapeClipCss(type: FrameShapeType): string | undefined {
  switch (type) {
    case 'rectangle':
      return undefined // AABB already matches
    case 'round-rectangle':
      return 'inset(0 round 12px)' // Matches Shape round-rect radius floor
    case 'circle':
      return 'ellipse(50% 50% at 50% 50%)' // Stretch ellipse to the frame box
    case 'diamond':
      return 'polygon(50% 0%, 100% 50%, 50% 100%, 0% 50%)'
    case 'triangle':
      return 'polygon(50% 0%, 100% 100%, 0% 100%)'
    case 'hexagon':
      return 'polygon(10% 0%, 90% 0%, 100% 50%, 90% 100%, 10% 100%, 0% 50%)'
    case 'parallelogram':
      return 'polygon(25% 0%, 100% 0%, 75% 100%, 0% 100%)'
    case 'arrow-rectangle':
      return 'polygon(0% 0%, 90% 0%, 100% 50%, 90% 100%, 0% 100%)'
    case 'plus':
      return 'polygon(33% 0%, 67% 0%, 67% 33%, 100% 33%, 100% 67%, 67% 67%, 67% 100%, 33% 100%, 33% 67%, 0% 67%, 0% 33%, 33% 33%)'
    case 'cylinder':
      // Match components/shapes/types/cylinder.tsx (bend = 12.5% of height)
      return 'path("M 0 12.5%, L 0 87.5%, A 50% 12.5% 0 1 0 100% 87.5%, L 100% 12.5%, A 50% 12.5% 0 1 1 0% 12.5%, Z")'
    default:
      return undefined
  }
}
