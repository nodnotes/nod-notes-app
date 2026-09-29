/** Frame fill/border palette + helpers — borders stay close to pastel fills. */

/** Fixed stroke for every frame border — no per-frame thickness control. */
export const FRAME_BORDER_WEIGHT = 1

/** Darken a hex color slightly so borders read against their fill without heavy contrast. */
export function frameBorderFromFill(fillHex: string, amount = 0.12): string {
  const clean = fillHex.replace('#', '') // Strip hash for channel math
  if (clean.length !== 6) return fillHex // Non-hex custom values pass through unchanged
  const factor = 1 - amount // Scale RGB toward black
  const to = (n: number) =>
    Math.max(0, Math.min(255, Math.round(n * factor)))
      .toString(16)
      .padStart(2, '0')
  const r = parseInt(clean.slice(0, 2), 16) // Red channel
  const g = parseInt(clean.slice(2, 4), 16) // Green channel
  const b = parseInt(clean.slice(4, 6), 16) // Blue channel
  return `#${to(r)}${to(g)}${to(b)}`
}

/** Lighten a hex so dark-mode borders sit slightly above their fill. */
export function frameBorderFromFillLighten(fillHex: string, amount = 0.22): string {
  const clean = fillHex.replace('#', '') // Strip hash for channel math
  if (clean.length !== 6) return fillHex // Non-hex custom values pass through unchanged
  const to = (n: number) =>
    Math.max(0, Math.min(255, Math.round(n + (255 - n) * amount)))
      .toString(16)
      .padStart(2, '0')
  const r = parseInt(clean.slice(0, 2), 16) // Red channel
  const g = parseInt(clean.slice(2, 4), 16) // Green channel
  const b = parseInt(clean.slice(4, 6), 16) // Blue channel
  return `#${to(r)}${to(g)}${to(b)}`
}

// Sticky-note pastels — light enough for dark ink, saturated enough hues read apart at a glance.
const FRAME_FILLS = {
  gray: '#D8D8D0',
  brown: '#E8C090',
  orange: '#FFB86C',
  yellow: '#FFE066',
  green: '#8FD99A',
  blue: '#7EC8E8',
  purple: '#C9A0E8',
  pink: '#F0A0C8',
  red: '#F0A0A0',
} as const

// Dark-mode siblings — deeper + more chroma so light prose and hues both stay clear.
const FRAME_FILLS_DARK = {
  gray: '#454540',
  brown: '#6E4F32',
  orange: '#9A5A20',
  yellow: '#8A7220',
  green: '#2A6B3C',
  blue: '#245A7A',
  purple: '#5C3480',
  pink: '#803050',
  red: '#803838',
} as const

type FrameFillId = keyof typeof FRAME_FILLS

/** Light frame palette — fill uses soft tint; border is a subtle darker sibling. Stored values are always light-canonical. */
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

/** Prior washes (Notion near-white + prior dull pastels) — remap at paint to current tints. */
const LEGACY_FRAME_FILL_HEX: Record<string, string> = {
  // Original Notion near-white
  '#f1f1ef': FRAME_FILLS.gray,
  '#f4eeee': FRAME_FILLS.brown,
  '#fbecdd': FRAME_FILLS.orange,
  '#fbf3db': FRAME_FILLS.yellow,
  '#edf3ec': FRAME_FILLS.green,
  '#e7f3f8': FRAME_FILLS.blue,
  '#f6f3f9': FRAME_FILLS.purple,
  '#f9f2f5': FRAME_FILLS.pink,
  '#fdebec': FRAME_FILLS.red,
  // Prior soft pastels (too dull / low chroma)
  '#e3e3df': FRAME_FILLS.gray,
  '#efdbc8': FRAME_FILLS.brown,
  '#ffd9b0': FRAME_FILLS.orange,
  '#ffe8a3': FRAME_FILLS.yellow,
  '#cdebc8': FRAME_FILLS.green,
  '#c5e4f5': FRAME_FILLS.blue,
  '#e0d0f5': FRAME_FILLS.purple,
  '#f6d0e3': FRAME_FILLS.pink,
  '#f8c9c9': FRAME_FILLS.red,
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
  // Soft borders from Notion near-white fills (darken 12%)
  '#d4d4d2': frameBorderFromFill(FRAME_FILLS.gray),
  '#d7d1d1': frameBorderFromFill(FRAME_FILLS.brown),
  '#ddd0c2': frameBorderFromFill(FRAME_FILLS.orange),
  '#ddd6c1': frameBorderFromFill(FRAME_FILLS.yellow),
  '#d1d6d0': frameBorderFromFill(FRAME_FILLS.green),
  '#cbd6da': frameBorderFromFill(FRAME_FILLS.blue),
  '#d8d6db': frameBorderFromFill(FRAME_FILLS.purple),
  '#dbd5d8': frameBorderFromFill(FRAME_FILLS.pink),
  '#dfcfd0': frameBorderFromFill(FRAME_FILLS.red),
  // Soft borders from prior dull pastels (darken 12%)
  '#c8c8c4': frameBorderFromFill(FRAME_FILLS.gray),
  '#d2c1b0': frameBorderFromFill(FRAME_FILLS.brown),
  '#e0bf9b': frameBorderFromFill(FRAME_FILLS.orange),
  '#e0cc8f': frameBorderFromFill(FRAME_FILLS.yellow),
  '#b4cfb0': frameBorderFromFill(FRAME_FILLS.green),
  '#adc9d8': frameBorderFromFill(FRAME_FILLS.blue),
  '#c5b7d8': frameBorderFromFill(FRAME_FILLS.purple),
  '#d8b7c8': frameBorderFromFill(FRAME_FILLS.pink),
  '#dab1b1': frameBorderFromFill(FRAME_FILLS.red),
}

/** Map light-canonical preset fill → dark paint hex. */
const LIGHT_TO_DARK_FILL: Record<string, string> = Object.fromEntries(
  (Object.keys(FRAME_FILLS) as FrameFillId[]).map((id) => [
    FRAME_FILLS[id].toLowerCase(),
    FRAME_FILLS_DARK[id],
  ])
)

/** Map dark paint hex → light-canonical (identity for matching / theme flip). */
const DARK_TO_LIGHT_FILL: Record<string, string> = Object.fromEntries(
  (Object.keys(FRAME_FILLS) as FrameFillId[]).map((id) => [
    FRAME_FILLS_DARK[id].toLowerCase(),
    FRAME_FILLS[id],
  ])
)

/** Map light-canonical preset border → dark paint hex. */
const LIGHT_TO_DARK_BORDER: Record<string, string> = Object.fromEntries(
  (Object.keys(FRAME_FILLS) as FrameFillId[]).map((id) => [
    frameBorderFromFill(FRAME_FILLS[id]).toLowerCase(),
    frameBorderFromFillLighten(FRAME_FILLS_DARK[id]),
  ])
)

/** Map dark border paint → light-canonical. */
const DARK_TO_LIGHT_BORDER: Record<string, string> = Object.fromEntries(
  (Object.keys(FRAME_FILLS) as FrameFillId[]).map((id) => [
    frameBorderFromFillLighten(FRAME_FILLS_DARK[id]).toLowerCase(),
    frameBorderFromFill(FRAME_FILLS[id]),
  ])
)

/** Canonical light fill hex for a stored value (legacy + dark paint → light). */
function canonicalFrameFill(fill: string): string {
  const key = fill.toLowerCase()
  return LEGACY_FRAME_FILL_HEX[key] ?? DARK_TO_LIGHT_FILL[key] ?? fill
}

/** Canonical light border hex for a stored value (legacy + dark paint → light). */
function canonicalFrameBorder(border: string): string {
  const key = border.toLowerCase()
  return LEGACY_FRAME_BORDER_HEX[key] ?? DARK_TO_LIGHT_BORDER[key] ?? border
}

/**
 * Resolve stored fill hex for paint.
 * Upgrades legacy pale presets; in dark mode remaps palette fills so light text stays readable.
 * Custom picks pass through. Empty → undefined (transparent).
 */
export function resolveFrameFillColor(
  fill: string | null | undefined,
  theme: 'light' | 'dark' = 'light'
): string | undefined {
  const f = (fill || '').trim()
  if (!f) return undefined
  const light = canonicalFrameFill(f)
  if (theme === 'dark') {
    return LIGHT_TO_DARK_FILL[light.toLowerCase()] ?? light // Preset → dark sibling; custom stays
  }
  return light
}

/**
 * Resolve stored border hex for paint.
 * Softens legacy preset accents; in dark mode remaps palette borders to lightened dark siblings.
 */
export function resolveFrameBorderColor(
  border: string | null | undefined,
  theme: 'light' | 'dark' = 'light'
): string | undefined {
  const b = (border || '').trim()
  if (!b) return undefined
  const light = canonicalFrameBorder(b)
  if (theme === 'dark') {
    return LIGHT_TO_DARK_BORDER[light.toLowerCase()] ?? light // Preset → dark sibling; custom stays
  }
  return light
}

/** Swatches with theme-aware preview hexes; `.fill`/`.border` stay light-canonical for persistence. */
export function frameColorSwatchesForTheme(theme: 'light' | 'dark') {
  return FRAME_COLOR_SWATCHES.map((s) => ({
    ...s,
    displayFill: s.fill ? resolveFrameFillColor(s.fill, theme)! : '', // Empty = Default transparent
    displayBorder: s.border ? resolveFrameBorderColor(s.border, theme)! : '',
  }))
}

/** Palette ids the AI may emit (empty string = leave unchanged / omit). */
export const AI_FRAME_COLOR_IDS = FRAME_COLOR_SWATCHES.map((s) => s.id)

/** Human label for a stored fill hex (for context pack), or null when transparent. */
export function frameColorNameFromFill(fill: string | null | undefined): string | null {
  const resolved = resolveFrameFillColor(fill)?.toLowerCase() // Canonical light for name lookup
  if (!resolved) return null
  const swatch = FRAME_COLOR_SWATCHES.find((s) => s.fill.toLowerCase() === resolved)
  return swatch ? swatch.name : 'custom'
}

/**
 * Map AI `color` field → fill/border. Empty / unknown → null (no change).
 * Accepts palette id or display name (case-insensitive). Always stores light-canonical hexes.
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
