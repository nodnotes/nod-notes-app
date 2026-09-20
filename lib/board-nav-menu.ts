// Shared pan/zoom signal for menus that sit in screen space (block ⋮⋮, frame menu, text select).
// One observer and one settle timer so every subscriber’s onSettle runs in the same turn —
// React batches the re-anchor and the reveal into one paint (no flash at the old spot).

/** Quiet gap after the last viewport transform before a menu may show again. */
export const BOARD_NAV_MENU_SETTLE_MS = 150

type NavHandlers = {
  onStart?: () => void // Hide immediately — board is moving
  onSettle?: () => void // Nav stopped — measure, then show
}

const subscribers = new Set<NavHandlers>() // Insertion order = callback order
let observer: MutationObserver | null = null
let watching: HTMLElement | null = null // Viewport element the observer is attached to
let settleTimer: number | undefined

/** Attach once to the live React Flow viewport (wheel zoom writes its style even without onMove). */
function ensureViewportWatch(): void {
  const viewportEl = document.querySelector('.react-flow__viewport') as HTMLElement | null
  if (!viewportEl || viewportEl === watching) return
  observer?.disconnect()
  watching = viewportEl
  observer = new MutationObserver(() => {
    subscribers.forEach((handlers) => handlers.onStart?.()) // Hide on this pan/zoom frame
    if (settleTimer !== undefined) window.clearTimeout(settleTimer)
    settleTimer = window.setTimeout(() => {
      settleTimer = undefined
      subscribers.forEach((handlers) => handlers.onSettle?.()) // Re-anchor and reveal together
    }, BOARD_NAV_MENU_SETTLE_MS)
  })
  observer.observe(viewportEl, { attributes: true, attributeFilter: ['style'] }) // Transform is inline style
}

/** Subscribe while a menu is open. Drop the observer when the last menu closes. */
export function watchBoardViewportNav(handlers: NavHandlers): () => void {
  subscribers.add(handlers)
  ensureViewportWatch()
  return () => {
    subscribers.delete(handlers)
    if (subscribers.size > 0) return
    observer?.disconnect()
    observer = null
    watching = null
    if (settleTimer !== undefined) window.clearTimeout(settleTimer)
    settleTimer = undefined
  }
}

/**
 * A press on the board may be a pan/zoom. Dismiss on pointerup only if the viewport
 * style did not change — otherwise the menu hides for the gesture and returns.
 */
export function dismissMenuUnlessBoardNav(dismiss: () => void): void {
  const viewport = document.querySelector('.react-flow__viewport') as HTMLElement | null
  const before = viewport?.getAttribute('style') ?? '' // Snapshot before the gesture moves the camera
  const onUp = () => {
    window.removeEventListener('pointerup', onUp, true)
    window.removeEventListener('pointercancel', onUp, true)
    const after = viewport?.getAttribute('style') ?? ''
    if (viewport && before !== after) return // Camera moved — keep the menu for the settle reveal
    dismiss() // Stationary click outside — close
  }
  window.addEventListener('pointerup', onUp, true)
  window.addEventListener('pointercancel', onUp, true)
}
