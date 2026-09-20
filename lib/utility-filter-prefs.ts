// Remember utility Layers / Sets / Views filter rows across tab switches and reload.

/** Layers filter menu — All · All touching (default) · Selected only. */
export type UtilityLayersFilter = 'all' | 'touching' | 'selected'

const LAYERS_KEY = 'nodnotes-utility-layers-filter' // Survives reload + leaving the Layers tab
const SETS_KEY = 'nodnotes-utility-sets-this-board' // '1' = This board only
const CAPTURES_KEY = 'nodnotes-utility-captures-this-board' // '1' = This board only

const DEFAULT_LAYERS: UtilityLayersFilter = 'touching' // Same default as the first-visit Layers list

/** Normalize a stored Layers filter string. */
function parseLayersFilter(raw: string | null): UtilityLayersFilter {
  if (raw === 'all' || raw === 'touching' || raw === 'selected') return raw // Known rows only
  return DEFAULT_LAYERS // Corrupt / missing → cluster
}

/** Last Layers filter (SSR-safe → touching). */
export function readUtilityLayersFilter(): UtilityLayersFilter {
  if (typeof window === 'undefined') return DEFAULT_LAYERS // Server has no storage
  try {
    return parseLayersFilter(window.localStorage.getItem(LAYERS_KEY)) // Restore All / touching / selected
  } catch {
    return DEFAULT_LAYERS // Private mode / quota
  }
}

/** Persist the Layers filter row the user picked. */
export function writeUtilityLayersFilter(filter: UtilityLayersFilter): void {
  if (typeof window === 'undefined') return // No storage on server
  try {
    window.localStorage.setItem(LAYERS_KEY, filter) // Next mount / reload keeps the choice
  } catch {
    /* Quota / private mode */
  }
}

/** Last Sets or Views “This board only” flag (SSR-safe → All boards). */
export function readUtilityThisBoardOnly(which: 'sets' | 'captures'): boolean {
  if (typeof window === 'undefined') return false // Server default = All boards
  const key = which === 'sets' ? SETS_KEY : CAPTURES_KEY // Separate prefs per utility tab
  try {
    return window.localStorage.getItem(key) === '1' // '1' means This board only
  } catch {
    return false // Private mode / quota
  }
}

/** Persist Sets or Views board-scope filter. */
export function writeUtilityThisBoardOnly(which: 'sets' | 'captures', thisBoardOnly: boolean): void {
  if (typeof window === 'undefined') return // No storage on server
  const key = which === 'sets' ? SETS_KEY : CAPTURES_KEY // Same keys as the readers
  try {
    if (thisBoardOnly) window.localStorage.setItem(key, '1') // Remember This board
    else window.localStorage.removeItem(key) // Missing key = All boards (default)
  } catch {
    /* Quota / private mode */
  }
}
