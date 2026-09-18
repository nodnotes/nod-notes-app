// Persist “don’t show again” for the global Sort confirmation dialog.

const STORAGE_KEY = 'nodnotes-global-sort-skip-confirm' // localStorage flag

/** True when the user opted out of the global Sort are-you-sure dialog. */
export function getGlobalSortSkipConfirm(): boolean {
  if (typeof window === 'undefined') return false
  try {
    return window.localStorage.getItem(STORAGE_KEY) === '1'
  } catch {
    return false
  }
}

/** Remember (or clear) the don’t-show-again preference. */
export function setGlobalSortSkipConfirm(skip: boolean): void {
  if (typeof window === 'undefined') return
  try {
    if (skip) window.localStorage.setItem(STORAGE_KEY, '1')
    else window.localStorage.removeItem(STORAGE_KEY)
  } catch {
    // Quota / private mode — ignore
  }
}
