// Present mode — hide board chrome and show only the map. Escape exits.

type PresentListener = () => void

const listeners = new Set<PresentListener>()
let presenting = false // Module flag survives client navigations between boards

function notify() {
  listeners.forEach((fn) => fn())
}

/** Subscribe for useSyncExternalStore. */
export function subscribePresenting(fn: PresentListener): () => void {
  listeners.add(fn)
  return () => {
    listeners.delete(fn)
  }
}

/** Whether present mode is on (SSR → false). */
export function getPresenting(): boolean {
  return presenting
}

/** Hide menus and show only the board. */
export function startPresenting(): void {
  if (presenting) return
  presenting = true
  notify()
}

/** Restore menus. */
export function stopPresenting(): void {
  if (!presenting) return
  presenting = false
  notify()
}
