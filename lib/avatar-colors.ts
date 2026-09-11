/** Saturated circle fills for profile avatars (not the pastel frame palette). */

export const DEFAULT_AVATAR_COLOR = '#22c55e' // Matches the previous green avatar disc

export const AVATAR_COLOR_SWATCHES = [
  { id: 'green', hex: '#22c55e', name: 'Green' },
  { id: 'blue', hex: '#3b82f6', name: 'Blue' },
  { id: 'purple', hex: '#a855f7', name: 'Purple' },
  { id: 'pink', hex: '#ec4899', name: 'Pink' },
  { id: 'red', hex: '#ef4444', name: 'Red' },
  { id: 'orange', hex: '#f97316', name: 'Orange' },
  { id: 'yellow', hex: '#eab308', name: 'Yellow' },
  { id: 'teal', hex: '#14b8a6', name: 'Teal' },
  { id: 'slate', hex: '#64748b', name: 'Slate' },
  { id: 'black', hex: '#1e293b', name: 'Black' },
] as const

export type AvatarColorId = (typeof AVATAR_COLOR_SWATCHES)[number]['id']

/** Normalize stored hex; fall back to default green when missing/invalid. */
export function resolveAvatarColor(raw: string | null | undefined): string {
  const hex = (raw || '').trim()
  if (/^#[0-9a-fA-F]{6}$/.test(hex)) return hex
  return DEFAULT_AVATAR_COLOR
}
