/** Frame fill/border palette + helpers — borders stay close to pastel fills. */

/** Fixed stroke for every frame border — no per-frame thickness control. */
export const FRAME_BORDER_WEIGHT = 1

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

// Still-light pastels with more chroma so hues read apart on the board (was near-white Notion wash).
const FRAME_FILLS = {
  gray: '#E3E3DF',
  brown: '#EFDBC8',
  orange: '#FFD9B0',
  yellow: '#FFE8A3',
  green: '#CDEBC8',
  blue: '#C5E4F5',
  purple: '#E0D0F5',
  pink: '#F6D0E3',
  red: '#F8C9C9',
} as const

/** Light frame palette — fill uses soft tint; border is a subtle darker sibling. */
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

/** Prior near-white Notion fills — remap at render so saved frames pick up the clearer tints. */
const LEGACY_FRAME_FILL_HEX: Record<string, string> = {
  '#f1f1ef': FRAME_FILLS.gray,
  '#f4eeee': FRAME_FILLS.brown,
  '#fbecdd': FRAME_FILLS.orange,
  '#fbf3db': FRAME_FILLS.yellow,
  '#edf3ec': FRAME_FILLS.green,
  '#e7f3f8': FRAME_FILLS.blue,
  '#f6f3f9': FRAME_FILLS.purple,
  '#f9f2f5': FRAME_FILLS.pink,
  '#fdebec': FRAME_FILLS.red,
}

/** Previous strong Notion accent strokes + old soft borders — remap at render. */
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
  // Soft borders computed from the old near-white fills (darken 12%)
  '#d4d4d2': frameBorderFromFill(FRAME_FILLS.gray),
  '#d7d1d1': frameBorderFromFill(FRAME_FILLS.brown),
  '#ddd0c2': frameBorderFromFill(FRAME_FILLS.orange),
  '#ddd6c1': frameBorderFromFill(FRAME_FILLS.yellow),
  '#d1d6d0': frameBorderFromFill(FRAME_FILLS.green),
  '#cbd6da': frameBorderFromFill(FRAME_FILLS.blue),
  '#d8d6db': frameBorderFromFill(FRAME_FILLS.purple),
  '#dbd5d8': frameBorderFromFill(FRAME_FILLS.pink),
  '#dfcfd0': frameBorderFromFill(FRAME_FILLS.red),
}

/** Resolve stored fill hex — upgrades legacy pale presets; custom picks pass through. */
export function resolveFrameFillColor(fill: string | null | undefined): string | undefined {
  const f = (fill || '').trim()
  if (!f) return undefined
  return LEGACY_FRAME_FILL_HEX[f.toLowerCase()] ?? f
}

/** Resolve stored border hex — softens legacy preset accents; custom picks pass through. */
export function resolveFrameBorderColor(border: string | null | undefined): string | undefined {
  const b = (border || '').trim()
  if (!b) return undefined
  return LEGACY_FRAME_BORDER_HEX[b.toLowerCase()] ?? b
}

/** Palette ids the AI may emit (empty string = leave unchanged / omit). */
export const AI_FRAME_COLOR_IDS = FRAME_COLOR_SWATCHES.map((s) => s.id)

/** Human label for a stored fill hex (for context pack), or null when transparent. */
export function frameColorNameFromFill(fill: string | null | undefined): string | null {
  const resolved = resolveFrameFillColor(fill)?.toLowerCase()
  if (!resolved) return null
  const swatch = FRAME_COLOR_SWATCHES.find((s) => s.fill.toLowerCase() === resolved)
  return swatch ? swatch.name : 'custom'
}

/**
 * Map AI `color` field → fill/border. Empty / unknown → null (no change).
 * Accepts palette id or display name (case-insensitive).
 */
export function resolveAiFrameColor(
  raw: string | null | undefined
): { id: string; name: string; fill: string; border: string } | null {
  const key = (raw || '').trim().toLowerCase()
  if (!key || key === 'none' || key === 'unchanged' || key === 'keep') return null
  const swatch = FRAME_COLOR_SWATCHES.find(
    (s) => s.id === key || s.name.toLowerCase() === key
  )
  if (!swatch) return null
  return { id: swatch.id, name: swatch.name, fill: swatch.fill, border: swatch.border }
}

/** Metadata patch for fill + matching subtle border (or clear both on default). */
export function frameColorMetaPatch(fill: string, border: string): Record<string, unknown> {
  const patch: Record<string, unknown> = {
    fillColor: fill || null,
    borderColor: border || null,
  }
  if (border) {
    // Match manual Color menu: show a solid stroke when a border hex is set
    patch.borderStyle = 'solid'
    patch.borderWeight = FRAME_BORDER_WEIGHT // Always the same line width
  }
  return patch
}
