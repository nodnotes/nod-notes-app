// Phone / iPad Safari dies when a board paints a huge frame or mounts many live editors.
// RF's viewport `transform` composites every node at its *layout* size, not its screen size,
// so one board-body (imported page) or a dragged-tall frame is a multi‑hundred‑MB texture.

/** True on touch / coarse pointers — iPad landscape is still Safari-memory-bound. */
export function isPhoneLikeBoard(): boolean {
  if (typeof window === 'undefined') return false // SSR has no media queries
  if (window.innerWidth > 0 && window.innerWidth < 900) return true // Phone + narrow tablet (don’t trust hover MQ)
  if (typeof navigator !== 'undefined' && navigator.maxTouchPoints > 1) return true // iPhone / iPad
  return (
    window.matchMedia('(hover: none)').matches || // Phones + many tablets
    window.matchMedia('(pointer: coarse)').matches // Finger / pen; iPad included
  )
}

/** iOS max texture is ~4096 device px; 3× DPR → ~1365 CSS px. Stay under that. */
export const PHONE_FRAME_PAINT_MAX_PX = 1200

/** Stored HTML this long is a page-body / import — do not auto-mount TipTap on phone. */
export const PHONE_HEAVY_HTML_CHARS = 12_000

/** Flow-space edge past this rasterizes a layer that OOMs phone Safari under RF zoom. */
export const PHONE_HEAVY_BOX_PX = 1600

/** True when this frame's HTML, box, or CSS scale would OOM phone Safari if painted full-size. */
export function isHeavyFrame(opts: {
  html?: string | null
  width?: number | null
  height?: number | null
  scale?: number | null
}): boolean {
  const html = opts.html ?? ''
  if (html.length >= PHONE_HEAVY_HTML_CHARS) return true // Imported page / long board-body
  if ((opts.scale ?? 1) >= 4) return true // Place/lock scale 4+ is already a 4× texture
  const w = opts.width ?? 0
  const h = opts.height ?? 0
  if (w >= PHONE_HEAVY_BOX_PX || h >= PHONE_HEAVY_BOX_PX) return true // Dragged-huge box
  if (w > 0 && h > 0 && w * h >= 1_400_000) return true // Area bomb even if both edges are under the cap
  return false
}
