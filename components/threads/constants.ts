/** Thread path algorithm — Miro-like smooth curves use BezierCatmullRom. */
export enum ThreadAlgorithm {
  BezierCatmullRom = 'Bezier Catmull-Rom', // Smooth path through control points (default)
  CatmullRom = 'Catmull-Rom', // Pure Catmull-Rom (no end-side bezier bias)
  Orthogonal = 'Orthogonal', // Sharp: ridged path with rounded 90° elbows
  Linear = 'Linear', // Straight segments through points
}

/** Default stroke for selected / editing threads (Miro blue). */
export const THREAD_SELECTED_COLOR = '#0375ff'

/** Default stroke for idle threads. */
export const THREAD_DEFAULT_COLOR = '#6b7280' // gray-500

/** localStorage key for the Style-bar Thread color board default. */
export const THREAD_STROKE_COLOR_KEY = 'nodnotes-thread-stroke-color'

/** Notion-style stroke swatches for the Thread style color picker (empty = default gray). */
export const THREAD_COLOR_SWATCHES = [
  { id: 'default', name: 'Default', value: '' },
  { id: 'gray', name: 'Gray', value: '#787774' },
  { id: 'brown', name: 'Brown', value: '#9F6B53' },
  { id: 'orange', name: 'Orange', value: '#D9730D' },
  { id: 'yellow', name: 'Yellow', value: '#CB912F' },
  { id: 'green', name: 'Green', value: '#448361' },
  { id: 'blue', name: 'Blue', value: '#337EA9' },
  { id: 'purple', name: 'Purple', value: '#9065B0' },
  { id: 'pink', name: 'Pink', value: '#C14C8A' },
  { id: 'red', name: 'Red', value: '#E03E3E' },
] as const

/** Normalize a stored / picker stroke to a paint hex (empty → default gray). */
export function resolveThreadStrokeColor(color?: string | null): string {
  const t = (color || '').trim()
  return t || THREAD_DEFAULT_COLOR
}

/** Default thread thickness in flow px (menu 1–4px options). */
export const THREAD_DEFAULT_STROKE_WIDTH = 2

/** Reference frame area (≈ empty one-line) for relative thread thickness. */
const THREAD_FRAME_AREA_REF = 48 * 22

/**
 * How thick a thread end should read for a frame’s flow box.
 * Bigger frames → thicker end; smaller → thinner. Gentle curve so extremes stay readable.
 * Result multiplies menu stroke width; CSS `--tt-thread-inv-zoom` keeps it screen-constant.
 */
export function threadWidthFactorForFrameSize(size: {
  width: number
  height: number
}): number {
  const w = Math.max(1, size.width)
  const h = Math.max(1, size.height)
  const area = w * h
  // sqrt(sqrt(area/ref)) ≈ soft; clamp so tiny frames don’t vanish and huge ones don’t dominate
  return Math.min(2.4, Math.max(0.55, Math.pow(area / THREAD_FRAME_AREA_REF, 0.25)))
}

/** Menu stroke × frame-size factor → `--tt-edge-w` at that end (CSS still ÷ zoom). */
export function threadEndStrokeWidth(
  menuWidth: number,
  size: { width: number; height: number }
): number {
  return Math.max(0.5, menuWidth * threadWidthFactorForFrameSize(size))
}

/** Algorithm used for new threads. */
export const DEFAULT_THREAD_ALGORITHM: ThreadAlgorithm = ThreadAlgorithm.BezierCatmullRom

/** Toolbar thread style prefs (localStorage `nodnotes-horizontal-line-style`). */
export type ThreadStylePref = 'curved' | 'boxed' | 'linear'

/** Map toolbar Smooth / Sharp / Linear → path algorithm. */
export function threadAlgorithmFromStyle(
  style: ThreadStylePref | string | null | undefined
): ThreadAlgorithm {
  if (style === 'boxed') return ThreadAlgorithm.Orthogonal // Sharp = 90° ridged
  if (style === 'linear') return ThreadAlgorithm.Linear // Straight
  return ThreadAlgorithm.BezierCatmullRom // Smooth (default / curved)
}

/** Map path algorithm → toolbar radio value. */
export function threadStyleFromAlgorithm(
  algorithm: ThreadAlgorithm | undefined
): 'smooth' | 'sharp' | 'linear' {
  if (algorithm === ThreadAlgorithm.Orthogonal) return 'sharp'
  if (algorithm === ThreadAlgorithm.Linear) return 'linear'
  return 'smooth'
}

/** True when the thread uses ridged 90° (Sharp) routing. */
export function isSharpThreadAlgorithm(
  algorithm: ThreadAlgorithm | undefined
): boolean {
  return algorithm === ThreadAlgorithm.Orthogonal
}

/**
 * Flow-space multiplier for callers that still need a JS zoom factor.
 * Prefer CSS `--tt-board-zoom` for thread stroke (live, no React freeze).
 * Pure 1/zoom so thickness stays constant on screen when applied.
 */
export function threadComfortScale(zoom: number): number {
  const z = Math.max(0.01, zoom) // Guard against 0 / negative store values
  return 1 / z // Screen px ≈ menu stroke width at every zoom
}

/** Base boost so frame chrome (handles / ⋮⋮ gutter / rotate) reads at a usable screen size. */
export const FRAME_SCREEN_CHROME_BOOST = 1.4

/**
 * Flow-space multiplier for frame selection chrome widgets so they stay constant on screen:
 * connection indicators, resize dots + blue stroke, rotate/fit/wrap, and blue↔fill L/R gutters.
 * Pure 1/zoom (× boost). TipTap ⋮⋮ / add-lines use a separate √ comfort curve (text-relative).
 */
export function frameScreenChromeScale(zoom: number): number {
  const z = Math.max(0.01, zoom) // Guard against 0 / negative store values
  return FRAME_SCREEN_CHROME_BOOST / z // Screen px ≈ base × boost at every zoom
}
