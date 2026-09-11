// Board-place I-bar / new-frame size: keep typing near 100%-zoom screen size across zoom.

/** Soft floor — past this, extreme zoom-in still grows place size some ("to a point"). */
export const IBAR_PLACE_SCALE_MIN = 0.4
/** Soft ceiling — past this, extreme zoom-out still shrinks place size some ("to a point"). */
export const IBAR_PLACE_SCALE_MAX = 4

/**
 * Flow-space `frameScale` for I-bar place + first keystroke spawn.
 * Ideal `1/zoom` → screen size matches 100% prose; clamps so 10% / 1000% don't go infinite.
 */
export function placeFrameScale(zoom: number): number {
  const z = Math.max(0.01, zoom) // Guard RF store 0 / negative
  const ideal = 1 / z // Screen px ≈ flow × zoom × scale → constant when unclamped
  return Math.min(IBAR_PLACE_SCALE_MAX, Math.max(IBAR_PLACE_SCALE_MIN, ideal))
}

/**
 * Pane-space multiplier for pre-frame I-bar chrome (outside RF viewport transform).
 * Unclamped band → exactly 1 (no float wobble / post-zoom snap). Clamped extremes ride zoom.
 */
export function ibarPaneScale(zoom: number): number {
  const z = Math.max(0.01, zoom)
  const ideal = 1 / z
  if (ideal >= IBAR_PLACE_SCALE_MIN && ideal <= IBAR_PLACE_SCALE_MAX) return 1 // Exact screen-constant
  return z * placeFrameScale(z) // Only at zoom extremes
}
