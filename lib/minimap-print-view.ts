// Map print-view — letterbox the minimap hole to a paper / aspect crop.

export const MINIMAP_PRINT_ID_KEY = 'nodnotes-minimap-print-id' // Chosen crop (View = live camera)
export const MINIMAP_PRINT_LANDSCAPE_KEY = 'nodnotes-minimap-print-landscape' // Flip paper width/height

export type MinimapPrintId =
  | 'view'
  | 'letter'
  | 'legal'
  | 'tabloid'
  | 'a4'
  | 'a3'
  | 'square'
  | 'wide'

export type MinimapPrintPreset = {
  id: MinimapPrintId
  label: string
  size: string | null // Muted paper length; null for the live camera
  portraitW: number // Width in portrait (any unit — only the ratio is used)
  portraitH: number
}

export const MINIMAP_PRINT_PRESETS: MinimapPrintPreset[] = [
  { id: 'view', label: 'View', size: null, portraitW: 0, portraitH: 0 },
  { id: 'letter', label: 'Letter', size: '8.5 × 11 in', portraitW: 8.5, portraitH: 11 },
  { id: 'legal', label: 'Legal', size: '8.5 × 14 in', portraitW: 8.5, portraitH: 14 },
  { id: 'tabloid', label: 'Tabloid', size: '11 × 17 in', portraitW: 11, portraitH: 17 },
  { id: 'a4', label: 'A4', size: '210 × 297 mm', portraitW: 210, portraitH: 297 },
  { id: 'a3', label: 'A3', size: '297 × 420 mm', portraitW: 297, portraitH: 420 },
  { id: 'square', label: 'Square', size: '1 × 1', portraitW: 1, portraitH: 1 },
  { id: 'wide', label: '16:9', size: '16 × 9', portraitW: 9, portraitH: 16 },
]

const PRINT_IDS = new Set<string>(MINIMAP_PRINT_PRESETS.map((p) => p.id))

export function readMinimapPrintId(): MinimapPrintId {
  if (typeof window === 'undefined') return 'view'
  const raw = localStorage.getItem(MINIMAP_PRINT_ID_KEY)
  if (raw && PRINT_IDS.has(raw)) return raw as MinimapPrintId
  return 'view'
}

export function writeMinimapPrintId(id: MinimapPrintId): void {
  if (typeof window === 'undefined') return
  localStorage.setItem(MINIMAP_PRINT_ID_KEY, id)
}

export function readMinimapPrintLandscape(): boolean {
  if (typeof window === 'undefined') return false
  return localStorage.getItem(MINIMAP_PRINT_LANDSCAPE_KEY) === '1'
}

export function writeMinimapPrintLandscape(on: boolean): void {
  if (typeof window === 'undefined') return
  localStorage.setItem(MINIMAP_PRINT_LANDSCAPE_KEY, on ? '1' : '0')
}

/** Width/height for the hole, or null to keep the live camera. */
export function minimapPrintAspect(id: MinimapPrintId, landscape: boolean): number | null {
  if (id === 'view') return null
  const preset = MINIMAP_PRINT_PRESETS.find((p) => p.id === id)
  if (!preset || preset.portraitW <= 0 || preset.portraitH <= 0) return null
  const w = landscape ? preset.portraitH : preset.portraitW
  const h = landscape ? preset.portraitW : preset.portraitH
  return w / h
}

export function minimapPrintUsesOrientation(id: MinimapPrintId): boolean {
  return id !== 'view' && id !== 'square'
}
