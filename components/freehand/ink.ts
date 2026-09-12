// Shared Draw-bar ink ids + hex for pencil / highlighter freehand strokes
export type DrawInkId = 'black' | 'blue' | 'green' | 'red' // Same four swatches as the Draw dropdowns
export type FreehandInkKind = 'pencil' | 'highlighter' // Persisted on freehand node data

/** Pencil fill hex per swatch (opaque ink). */
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

/** Marker translucency so underlying board content shows through. */
export const HIGHLIGHTER_OPACITY = 0.45

/** Highlighter strokes are wider than the shared screen tip. */
export const HIGHLIGHTER_SIZE_MULT = 2.8

/** Resolve fill hex for a new stroke from tool kind + dropdown id. */
export function resolveStrokeHex(kind: FreehandInkKind, inkId: DrawInkId): string {
  return kind === 'highlighter' ? HIGHLIGHTER_INK_HEX[inkId] : DRAW_INK_HEX[inkId]
}

/** Screen tip diameter for the armed tool (highlighter tip is wider). */
export function resolveTipDiameterPx(kind: FreehandInkKind, tipPx: number): number {
  return kind === 'highlighter' ? Math.round(tipPx * HIGHLIGHTER_SIZE_MULT) : tipPx
}

/** Flow-space stroke width from a fixed screen tip + current zoom. */
export function resolveStrokeSizeFromZoom(
  kind: FreehandInkKind,
  tipPx: number,
  zoom: number,
): number {
  const z = Math.max(0.01, zoom)
  return resolveTipDiameterPx(kind, tipPx) / z
}
