// Board pref — hide frames that are large on screen when they overlap another frame.
// Board menu toggle; default off = always-visible (pre-feature behavior).

/** localStorage — hide large-overlapping frames on/off (default off). */
export const HIDE_LARGE_OVERLAP_STORAGE_KEY = 'nodnotes-hide-large-overlap'

/** Read preference (SSR-safe default: off). */
export function readHideLargeOverlapEnabled(): boolean {
  if (typeof window === 'undefined') return false
  const raw = localStorage.getItem(HIDE_LARGE_OVERLAP_STORAGE_KEY)
  if (raw === null) return false // Missing key = off — matches pre-feature paint
  return raw === '1' || raw === 'true'
}

/** Persist preference. */
export function writeHideLargeOverlapEnabled(on: boolean): void {
  if (typeof window === 'undefined') return
  localStorage.setItem(HIDE_LARGE_OVERLAP_STORAGE_KEY, on ? '1' : '0')
}
