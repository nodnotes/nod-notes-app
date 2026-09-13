// Shared Draw-bar ink ids + hex for pencil / highlighter freehand strokes
export type DrawInkId = 'black' | 'blue' | 'green' | 'red' // Legacy swatch ids (migrated → hex on load)
export type FreehandInkKind = 'pencil' | 'highlighter' // Persisted on freehand node data

/** Pencil fill hex per legacy swatch id (opaque ink). */
export const DRAW_INK_HEX: Record<DrawInkId, string> = {
  black: '#111827', // Near-black so light boards stay readable
  blue: '#2563eb', // Tailwind blue-600
  green: '#16a34a', // Tailwind green-600
  red: '#dc2626', // Tailwind red-600
}

/** Highlighter fill hex — brighter marker colors; black swatch → classic yellow. */
export const HIGHLIGHTER_INK_HEX: Record<DrawInkId, string> = {
  black: '#facc15', // Yellow marker (default highlighter look)
  blue: '#38bdf8', // Sky blue marker
  green: '#4ade80', // Soft green marker
  red: '#fb7185', // Soft red / pink marker
}

/** Cap how many custom slots the Draw ink column can grow. */
export const MAX_DRAW_PALETTE_LEN = 12

/** Fallback marker translucency when a legacy 6-digit highlighter stroke has no alpha. */
export const HIGHLIGHTER_OPACITY = 0.45

/** Highlighter strokes are wider than the shared screen tip. */
export const HIGHLIGHTER_SIZE_MULT = 2.8

/** Expand `#rgb` → `#rrggbb`. */
function expandShortHex(t: string): string {
  if (t.length !== 4) return t
  const r = t[1]
  const g = t[2]
  const b = t[3]
  return `#${r}${r}${g}${g}${b}${b}`
}

/**
 * Normalize ink to lowercase `#rrggbb` or `#rrggbbaa`.
 * Empty → empty (fully transparent slot). Invalid → fallback.
 */
export function normalizeInkHex(raw: string | null | undefined, fallback: string): string {
  const t = (raw || '').trim()
  if (!t) return ''
  if (/^#[0-9a-fA-F]{8}$/.test(t)) return t.toLowerCase()
  if (/^#[0-9a-fA-F]{6}$/.test(t)) return t.toLowerCase()
  if (/^#[0-9a-fA-F]{3}$/.test(t)) return expandShortHex(t).toLowerCase()
  return fallback
}

/** RGB portion only (`#rrggbb`) for `<input type="color">`. */
export function inkRgbHex(raw: string | null | undefined, fallback = '#000000'): string {
  const n = normalizeInkHex(raw, fallback)
  if (!n) return fallback
  return n.length >= 7 ? n.slice(0, 7) : fallback
}

/** Alpha 0–1 from `#rrggbbaa` (6-digit → 1). Empty → 0. */
export function inkAlpha(raw: string | null | undefined): number {
  const n = normalizeInkHex(raw, '')
  if (!n) return 0
  if (n.length === 9) {
    const a = parseInt(n.slice(7, 9), 16)
    if (!Number.isFinite(a)) return 1
    return Math.min(1, Math.max(0, a / 255))
  }
  return 1
}

/** Combine RGB + alpha → always `#rrggbbaa` (transparency lives on the swatch). */
export function withInkAlpha(rgbRaw: string, alpha: number): string {
  const rgb = inkRgbHex(rgbRaw, '#000000')
  const a = Math.min(1, Math.max(0, alpha))
  const hex = Math.round(a * 255)
    .toString(16)
    .padStart(2, '0')
  return `${rgb}${hex}`
}

/** True when a string is a usable `#rgb` / `#rrggbb` / `#rrggbbaa` color. */
export function isInkHex(raw: string | null | undefined): boolean {
  const t = (raw || '').trim()
  return (
    /^#[0-9a-fA-F]{3}$/.test(t) ||
    /^#[0-9a-fA-F]{6}$/.test(t) ||
    /^#[0-9a-fA-F]{8}$/.test(t)
  )
}

/** Extra opaque stock swatches (no legacy ids) so the default pen menu fills 3 | 3 | 2+“+”. */
const DRAW_INK_PURPLE = '#9333ea' // Tailwind purple-600
const DRAW_INK_ORANGE = '#ea580c' // Tailwind orange-600
const DRAW_INK_PINK = '#db2777' // Tailwind pink-600
const HIGHLIGHTER_INK_PURPLE = '#c084fc' // Soft purple marker

/**
 * Default pen menu — 8 slots → columns of 3 | 3 | 2+“+”.
 * Origin column (right): translucent red + yellow highlighters above “+”.
 */
export const DEFAULT_PENCIL_PALETTE: string[] = [
  DRAW_INK_HEX.black, // Left column — default opaque pen (selected index 0)
  DRAW_INK_HEX.blue,
  DRAW_INK_HEX.green,
  DRAW_INK_PURPLE, // Middle column
  DRAW_INK_ORANGE,
  DRAW_INK_PINK,
  withInkAlpha(HIGHLIGHTER_INK_HEX.red, HIGHLIGHTER_OPACITY), // Origin: red highlighter
  withInkAlpha(HIGHLIGHTER_INK_HEX.black, HIGHLIGHTER_OPACITY), // Origin: yellow highlighter
]

/** Default highlighter row — marker colors at classic translucency (~45%). */
export const DEFAULT_HIGHLIGHTER_PALETTE: string[] = [
  withInkAlpha(HIGHLIGHTER_INK_HEX.black, HIGHLIGHTER_OPACITY),
  withInkAlpha(HIGHLIGHTER_INK_HEX.blue, HIGHLIGHTER_OPACITY),
  withInkAlpha(HIGHLIGHTER_INK_HEX.green, HIGHLIGHTER_OPACITY),
  withInkAlpha(HIGHLIGHTER_INK_HEX.red, HIGHLIGHTER_OPACITY),
  withInkAlpha(HIGHLIGHTER_INK_PURPLE, HIGHLIGHTER_OPACITY),
]

/** Map legacy id or hex → paint hex for a tool kind (may include alpha). */
export function resolveStrokeHex(kind: FreehandInkKind, ink: string): string {
  if (!(ink || '').trim()) return '#00000000' // Transparent pen slot
  if (ink === 'black' || ink === 'blue' || ink === 'green' || ink === 'red') {
    const base = kind === 'highlighter' ? HIGHLIGHTER_INK_HEX[ink] : DRAW_INK_HEX[ink]
    return kind === 'highlighter' ? withInkAlpha(base, HIGHLIGHTER_OPACITY) : base
  }
  const fallback = kind === 'highlighter' ? HIGHLIGHTER_INK_HEX.black : DRAW_INK_HEX.black
  const hex = normalizeInkHex(ink, fallback)
  if (!hex) return '#00000000'
  // Legacy 6-digit highlighter strokes keep the classic marker wash
  if (kind === 'highlighter' && hex.length === 7) return withInkAlpha(hex, HIGHLIGHTER_OPACITY)
  return hex
}

/** CSS fill + opacity for a resolved stroke (8-digit → fill RGB + separate opacity). */
export function strokePaintStyle(strokeHex: string): { fill: string; opacity: number } {
  const rgb = inkRgbHex(strokeHex, '#111827')
  const opacity = inkAlpha(strokeHex)
  return { fill: rgb, opacity }
}

/** Screen tip diameter for the armed tool (highlighter tip is wider). */
export function resolveTipDiameterPx(kind: FreehandInkKind, tipPx: number): number {
  return kind === 'highlighter' ? Math.round(tipPx * HIGHLIGHTER_SIZE_MULT) : tipPx
}

/**
 * Flow-space stroke width.
 * Locked: tip is screen px → divide by zoom. Unlocked: tip is already flow px.
 */
export function resolveStrokeSizeFromZoom(
  kind: FreehandInkKind,
  tipPx: number,
  zoom: number,
  zoomLocked = true,
): number {
  const tip = resolveTipDiameterPx(kind, tipPx)
  if (!zoomLocked) return tip // Unlocked — bar value is flow-space width
  const z = Math.max(0.01, zoom)
  return tip / z // Locked — constant on-screen thickness
}

/**
 * Inverse of resolveStrokeSizeFromZoom — bar thumb from an authored flow strokeSize.
 * Highlighter divides out HIGHLIGHTER_SIZE_MULT so the shared tip bar stays consistent.
 */
export function tipDiameterFromStrokeSize(
  kind: FreehandInkKind,
  strokeSize: number,
  zoom: number,
  zoomLocked = true,
): number {
  const painted = zoomLocked ? strokeSize * Math.max(0.01, zoom) : strokeSize // Flow → tip units
  const tip = kind === 'highlighter' ? painted / HIGHLIGHTER_SIZE_MULT : painted // Undo marker widen
  return Math.round(tip)
}

/**
 * Screen-space brush ring diameter for the live tip cursor.
 * Locked: fixed screen px. Unlocked: tip × zoom so the ring matches flow width.
 */
export function resolveBrushScreenDiameterPx(
  kind: FreehandInkKind,
  tipPx: number,
  zoom: number,
  zoomLocked = true,
): number {
  const tip = resolveTipDiameterPx(kind, tipPx)
  if (zoomLocked) return tip // Fixed screen ring
  const z = Math.max(0.01, zoom)
  return tip * z // Unlocked — ring grows/shrinks with camera zoom
}
