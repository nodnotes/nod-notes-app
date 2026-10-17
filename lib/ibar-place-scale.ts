// Board-place I-bar / new-frame size: match 100% prose when zoomed out; never below
// unscaled content when zoomed in (min content size at max zoom-in).
// Fit-to-text / free + growth: max = place-max visual + size-based gap (bigger object → bigger gap).

/**
 * Floor — min content size (frameScale 1). Place never shrinks below this when zoomed in.
 * Was 0.4: at max zoom-in (RF scale 2 / nav 50%) place was half of min content size and jumped on resize.
 */
export const IBAR_PLACE_SCALE_MIN = 1
/** Soft place ceiling — extreme zoom-out still shrinks place some ("to a point"). */
export const IBAR_PLACE_SCALE_MAX = 4

/** Smallest grow gap (flow px) past place-max visual — tiny frames still get headroom. */
export const CONTENT_GROW_GAP_MIN = 480
/**
 * Grow gap as a fraction of unscaled object size — bigger object → bigger absolute gap.
 * Max painted = placeMaxVisual + max(MIN, RATIO × unscaled) ≈ 32× for mid-size (was ~7× — not enough).
 */
export const CONTENT_GROW_GAP_RATIO = 28

/**
 * Extra flow px past place-max visual for fit-to-text / +'s.
 * Scales with the unscaled object (absolute gap, not a flat scale ceiling).
 */
export function contentGrowGap(unscaledPx: number): number {
  const s = Math.max(0, unscaledPx) // Guard empty measure
  return Math.max(CONTENT_GROW_GAP_MIN, s * CONTENT_GROW_GAP_RATIO) // Floor for tiny; else × object
}

/**
 * Max painted extent on one axis from unscaled object size.
 * Place-max visual + size-based gap — zoomed-out place can still grow; bigger object → bigger gap.
 */
export function maxContentExtent(unscaledPx: number): number {
  const s = Math.max(1, unscaledPx) // Never grow from 0
  return s * IBAR_PLACE_SCALE_MAX + contentGrowGap(s) // Place ceiling, then the variable gap
}

/**
 * Max uniform paint/frame scale from unscaled intrinsic (wrap column when wrapped).
 * Derived from per-axis max extents so the tighter axis wins.
 */
export function maxContentScale(intrinsicW: number, intrinsicH: number): number {
  const w = Math.max(1, intrinsicW) // Unscaled width
  const h = Math.max(1, intrinsicH) // Unscaled height
  return Math.min(maxContentExtent(w) / w, maxContentExtent(h) / h) // Uniform scale cap
}

/**
 * Flow-space `frameScale` for I-bar place + first keystroke spawn.
 * Zoomed out: `1/zoom` keeps screen size near 100% prose (up to place MAX).
 * Zoomed in: stays at 1 so glyphs match unscaled / min content size (ride the camera).
 */
export function placeFrameScale(zoom: number): number {
  const z = Math.max(0.01, zoom) // Guard RF store 0 / negative
  const ideal = 1 / z // Screen-constant when zoomed out; would shrink when zoomed in
  return Math.min(IBAR_PLACE_SCALE_MAX, Math.max(IBAR_PLACE_SCALE_MIN, ideal)) // Place band only
}

/**
 * Pane-space multiplier for pre-frame I-bar chrome (outside RF viewport transform).
 * Zoomed out (ideal in band): 1 = screen-constant with place. Zoomed in: rides zoom with scale 1.
 */
export function ibarPaneScale(zoom: number): number {
  const z = Math.max(0.01, zoom)
  const ideal = 1 / z
  if (ideal >= IBAR_PLACE_SCALE_MIN && ideal <= IBAR_PLACE_SCALE_MAX) return 1 // Zoomed out — screen-constant
  return z * placeFrameScale(z) // Zoomed in — same as content at frameScale 1
}
