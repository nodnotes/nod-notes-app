/** Frame fill/border palette + helpers — borders stay close to pastel fills. */

/** Darken a hex color slightly so borders read against their fill without heavy contrast. */
export function frameBorderFromFill(fillHex: string, amount = 0.12): string {
  const clean = fillHex.replace('#', '')
  if (clean.length !== 6) return fillHex
  const factor = 1 - amount
  const to = (n: number) =>
    Math.max(0, Math.min(255, Math.round(n * factor)))
      .toString(16)
      .padStart(2, '0')
  const r = parseInt(clean.slice(0, 2), 16)
  const g = parseInt(clean.slice(2, 4), 16)
  const b = parseInt(clean.slice(4, 6), 16)
  return `#${to(r)}${to(g)}${to(b)}`
}

const FRAME_FILLS = {
  gray: '#F1F1EF',
  brown: '#F4EEEE',
  orange: '#FBECDD',
  yellow: '#FBF3DB',
  green: '#EDF3EC',
  blue: '#E7F3F8',
  purple: '#F6F3F9',
  pink: '#F9F2F5',
  red: '#FDEBEC',
} as const

/** Notion-like frame palette — fill uses pale bg; border is a subtle darker sibling. */
export const FRAME_COLOR_SWATCHES = [
  { id: 'default', name: 'Default', fill: '', border: '' },
  { id: 'gray', name: 'Gray', fill: FRAME_FILLS.gray, border: frameBorderFromFill(FRAME_FILLS.gray) },
  { id: 'brown', name: 'Brown', fill: FRAME_FILLS.brown, border: frameBorderFromFill(FRAME_FILLS.brown) },
  { id: 'orange', name: 'Orange', fill: FRAME_FILLS.orange, border: frameBorderFromFill(FRAME_FILLS.orange) },
  { id: 'yellow', name: 'Yellow', fill: FRAME_FILLS.yellow, border: frameBorderFromFill(FRAME_FILLS.yellow) },
  { id: 'green', name: 'Green', fill: FRAME_FILLS.green, border: frameBorderFromFill(FRAME_FILLS.green) },
  { id: 'blue', name: 'Blue', fill: FRAME_FILLS.blue, border: frameBorderFromFill(FRAME_FILLS.blue) },
  { id: 'purple', name: 'Purple', fill: FRAME_FILLS.purple, border: frameBorderFromFill(FRAME_FILLS.purple) },
  { id: 'pink', name: 'Pink', fill: FRAME_FILLS.pink, border: frameBorderFromFill(FRAME_FILLS.pink) },
  { id: 'red', name: 'Red', fill: FRAME_FILLS.red, border: frameBorderFromFill(FRAME_FILLS.red) },
] as const

/** Previous strong Notion accent strokes — remap at render so saved frames soften too. */
const LEGACY_FRAME_BORDER_HEX: Record<string, string> = {
  '#787774': frameBorderFromFill(FRAME_FILLS.gray),
  '#9f6b53': frameBorderFromFill(FRAME_FILLS.brown),
  '#d9730d': frameBorderFromFill(FRAME_FILLS.orange),
  '#cb912f': frameBorderFromFill(FRAME_FILLS.yellow),
  '#448361': frameBorderFromFill(FRAME_FILLS.green),
  '#337ea9': frameBorderFromFill(FRAME_FILLS.blue),
  '#9065b0': frameBorderFromFill(FRAME_FILLS.purple),
  '#c14c8a': frameBorderFromFill(FRAME_FILLS.pink),
  '#e03e3e': frameBorderFromFill(FRAME_FILLS.red),
}

/** Resolve stored border hex — softens legacy preset accents; custom picks pass through. */
export function resolveFrameBorderColor(border: string | null | undefined): string | undefined {
  const b = (border || '').trim()
  if (!b) return undefined
  return LEGACY_FRAME_BORDER_HEX[b.toLowerCase()] ?? b
}
