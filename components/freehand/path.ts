// Path generation utilities for freehand drawing using perfect-freehand library
import getStroke from 'perfect-freehand'

/** Authored stroke width (flow px) for legacy nodes without strokeSize. */
export const DEFAULT_STROKE_SIZE = 7
/** Tip thickness bar floor (screen px). */
export const MIN_TIP_DIAMETER_PX = 4
/** Tip thickness bar ceiling (screen px). */
export const MAX_TIP_DIAMETER_PX = 48
/** Default pencil/highlighter tip (screen px). */
export const DEFAULT_DRAW_TIP_DIAMETER_PX = 12
/** Default spot/stroke eraser tip (screen px). */
export const DEFAULT_ERASER_TIP_DIAMETER_PX = 28
/** @deprecated Prefer DEFAULT_DRAW_TIP_DIAMETER_PX — kept as the draw default. */
export const DRAW_TIP_DIAMETER_PX = DEFAULT_DRAW_TIP_DIAMETER_PX
/** Legacy aliases for older imports. */
export const MIN_STROKE_SIZE = MIN_TIP_DIAMETER_PX
export const MAX_STROKE_SIZE = MAX_TIP_DIAMETER_PX

// Configuration options for the freehand stroke path generation
// size: Base stroke width in pixels
// thinning: How much the stroke thins based on pressure (0 = no thinning, 1 = full thinning)
// smoothing: How much to smooth the path (0 = no smoothing, 1 = full smoothing)
// streamline: How much to streamline the path (0 = no streamlining, 1 = full streamlining)
// easing: Easing function for the stroke (linear by default)
// start/end: Taper configuration for stroke start and end
export const pathOptions = {
  size: DEFAULT_STROKE_SIZE, // Base stroke diameter (overridden per call to match tip)
  thinning: 0, // Steady width — tip circle = painted diameter (not pressure ribbon)
  smoothing: 0.5, // Path smoothing amount
  streamline: 0.5, // Path streamlining amount
  simulatePressure: false, // Use authored pressure; don’t shrink fast moves
  easing: (t: number) => t, // Linear easing function
  start: {
    taper: 0, // No taper at start — round stamp matches the tip
    easing: (t: number) => t, // Linear easing
    cap: true, // Cap the start of the stroke
  },
  end: {
    taper: 0, // No taper at end — round stamp matches the tip
    easing: (t: number) => t, // Linear easing
    cap: true, // Cap the end of the stroke
  },
}

// Convert stroke points array to SVG path string
// stroke: Array of [x, y] coordinate pairs representing the stroke outline
// Returns: SVG path data string (d attribute)
export function getSvgPathFromStroke(stroke: number[][]) {
  if (!stroke.length) return '' // Return empty string if no stroke points

  // Build path using quadratic curves between points
  // M = move to, Q = quadratic curve to, Z = close path
  const d = stroke.reduce(
    (acc, [x0, y0], i, arr) => {
      const [x1, y1] = arr[(i + 1) % arr.length] // Get next point (wraps to first for closing)
      acc.push(x0, y0, ',', (x0 + x1) / 2, (y0 + y1) / 2) // Add point and midpoint for curve
      return acc
    },
    ['M', ...stroke[0], 'Q'] // Start with move to first point, then quadratic curve
  )

  d.push('Z') // Close the path
  return d.join(' ') // Join all path commands with spaces
}

// Convert drawing points to SVG path string
// points: Array of [x, y, pressure] tuples from pointer events
// zoom: Current viewport zoom level (default 1) - used to scale stroke size
// size: Authored stroke width in the same units as points (default DEFAULT_STROKE_SIZE)
// taper: Spot-erase cut ends taper to a point on the tip rim (no round cap bleeding into the circle)
// Returns: SVG path data string for rendering the stroke
export function pointsToPath(
  points: [number, number, number][],
  zoom = 1,
  size = DEFAULT_STROKE_SIZE,
  taper?: { start?: boolean; end?: boolean },
) {
  const paintSize = size * zoom // Diameter in the same space as points
  // Generate stroke outline from points using perfect-freehand
  const stroke = getStroke(points, {
    ...pathOptions,
    size: paintSize,
    start: {
      ...pathOptions.start,
      // Taper over one diameter so the tip dies at the rim instead of capping into the hole
      taper: taper?.start ? paintSize : 0,
    },
    end: {
      ...pathOptions.end,
      taper: taper?.end ? paintSize : 0,
    },
  })
  // Convert stroke outline to SVG path string
  return getSvgPathFromStroke(stroke)
}
