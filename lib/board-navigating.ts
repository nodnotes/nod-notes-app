// Board pan/pinch in progress. Freeze React zoom selectors so chrome/threads don’t
// re-render every tick — the RF viewport CSS transform still tracks fingers live.
// Notion DB tables no longer swap on this flag — see `database-block-view.tsx`. A selected table
// stays mounted through the gesture; only its idle *box* freeze (`freezeToLastBox`) still reads it.
//
// Screen-constant frame chrome (handles / indicators / blue stroke / rotate·fit·wrap) reads
// `--tt-frame-ui-scale` (and friends) set as concrete values every zoom tick — including a rAF
// pump while navigating so wheel setViewport (no RF onMove) still tracks live.

let navigating = false
let frozenZoom: number | null = null // Stable zoom for useStore selectors during the gesture
let settleTimer: ReturnType<typeof setTimeout> | null = null
let watchdogTimer: ReturnType<typeof setTimeout> | null = null // Gesture that never called end
const listeners = new Set<() => void>() // DB live / other subscribers

const NAV_CLASS = 'tt-board-navigating'
const NAV_WATCHDOG_MS = 1200 // Re-armed per move tick; only fires when a gesture dies silently
/** Keep in sync with FRAME_SCREEN_CHROME_BOOST in threads/constants. */
const CHROME_BOOST = 1.4
let lastZoomCss = '' // Skip redundant style writes mid-pinch
let zoomCssRaf = 0 // rAF pump while navigating — live chrome without React
let zoomCssReader: (() => { zoom: number; el: HTMLElement | null }) | null = null

function flowElFallback(): HTMLElement | null {
  return (
    (document.querySelector('[data-board-root] .react-flow') as HTMLElement | null) ||
    (document.querySelector('.react-flow') as HTMLElement | null)
  )
}

/**
 * BoardFlow registers a live zoom + domNode reader so CSS chrome can track mid-gesture
 * even when RF skips onMove (custom wheel setViewport).
 */
export function registerBoardZoomCssReader(
  reader: (() => { zoom: number; el: HTMLElement | null }) | null
): void {
  zoomCssReader = reader
  if (reader) syncBoardZoomCss(reader().zoom, reader().el) // Seed immediately on mount
}

/** Write concrete chrome vars (not calc()) so every browser refreshes mid-pinch. */
function applyZoomCss(el: HTMLElement, zoom: number): void {
  const z = Math.max(0.01, zoom)
  const next = String(z)
  if (next === lastZoomCss && el.style.getPropertyValue('--tt-board-zoom') === next) return
  lastZoomCss = next
  const ui = CHROME_BOOST / z // Same as frameScreenChromeScale
  // Concrete values — avoid relying on stylesheet calc() recalculating during compositor zoom
  el.style.setProperty('--tt-board-zoom', next)
  el.style.setProperty('--tt-frame-chrome-boost', String(CHROME_BOOST))
  el.style.setProperty('--tt-frame-ui-scale', String(ui))
  el.style.setProperty('--tt-frame-line-w', `${1 * ui}px`)
  el.style.setProperty('--tt-frame-line-hit', `${5 * ui}px`)
  el.style.setProperty('--tt-frame-handle', `${7 * ui}px`)
  el.style.setProperty('--tt-frame-handle-border', `${1.5 * ui}px`)
}

/**
 * Live board zoom for screen-constant frame chrome.
 * Call on every viewport zoom change — including mid-gesture — so chrome stays constant
 * without React re-renders (navigationZoom still freezes store selectors).
 */
export function syncBoardZoomCss(zoom: number, el?: HTMLElement | null): void {
  const target = el ?? zoomCssReader?.().el ?? flowElFallback()
  if (!target) return
  applyZoomCss(target, zoom)
}

/** rAF while navigating — polls live zoom so chrome tracks even without onMove. */
function pumpZoomCssWhileNavigating(): void {
  if (zoomCssRaf) return // Already pumping
  const tick = () => {
    if (!navigating) {
      zoomCssRaf = 0
      return
    }
    if (zoomCssReader) {
      const { zoom, el } = zoomCssReader()
      syncBoardZoomCss(zoom, el)
    }
    zoomCssRaf = requestAnimationFrame(tick)
  }
  zoomCssRaf = requestAnimationFrame(tick)
}

function notifyNavigating(): void {
  listeners.forEach((l) => l())
}

/** True while two-finger pan/zoom (or briefly after) is active. */
export function isBoardNavigating(): boolean {
  return navigating
}

/** Subscribe to navigating flag changes (for focus-gated DB tables). */
export function subscribeBoardNavigating(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/**
 * While navigating, return the zoom frozen at gesture start so React `useStore`
 * selectors stay stable. Viewport transform still updates every move.
 */
export function navigationZoom(liveZoom: number): number {
  if (navigating && frozenZoom != null) return frozenZoom
  return liveZoom
}

/** Release the freeze now (shared by settle + watchdog). */
function clearNavigating(): void {
  if (!navigating) return
  navigating = false
  frozenZoom = null
  if (zoomCssRaf) {
    cancelAnimationFrame(zoomCssRaf)
    zoomCssRaf = 0
  }
  // Final sync at the settled live zoom before React unfreezes
  if (zoomCssReader) {
    const { zoom, el } = zoomCssReader()
    syncBoardZoomCss(zoom, el)
  }
  const el = zoomCssReader?.().el ?? flowElFallback()
  el?.classList.remove(NAV_CLASS)
  notifyNavigating()
}

/**
 * Failsafe: a gesture that never calls `endBoardNavigating` (pointercancel, unmount mid-pinch,
 * RF skipping onMoveEnd) used to wedge `navigating` true forever — hug then skips, so DB frames
 * never shrink back on deselect. Callers heartbeat via `touchBoardNavigating` while moving.
 */
function armWatchdog(): void {
  if (watchdogTimer) clearTimeout(watchdogTimer)
  watchdogTimer = setTimeout(() => {
    watchdogTimer = null
    clearNavigating()
  }, NAV_WATCHDOG_MS)
}

/** Keep the freeze alive mid-gesture — optional live zoom keeps CSS chrome smooth. */
export function touchBoardNavigating(liveZoom?: number): void {
  if (!navigating) return
  armWatchdog()
  if (liveZoom != null) {
    syncBoardZoomCss(liveZoom) // Chrome CSS tracks fingers; React stays frozen
  } else if (zoomCssReader) {
    const { zoom, el } = zoomCssReader()
    syncBoardZoomCss(zoom, el)
  }
}

/** Mark gesture start — freeze zoom selectors; RF setViewport keeps tracking. */
export function beginBoardNavigating(zoom?: number): void {
  if (settleTimer) {
    clearTimeout(settleTimer)
    settleTimer = null
  }
  armWatchdog()
  if (zoom != null) syncBoardZoomCss(zoom) // Seed CSS even when already navigating (wheel bursts)
  else if (zoomCssReader) {
    const { zoom: z, el } = zoomCssReader()
    syncBoardZoomCss(z, el)
  }
  if (navigating) {
    pumpZoomCssWhileNavigating() // Ensure pump after wheel re-begin
    return
  }
  navigating = true
  const z = zoom ?? zoomCssReader?.().zoom ?? 1
  frozenZoom = Math.round(z * 8) / 8
  // pointer-events only — never visibility/content-visibility (those defer paint → jumpy zoom)
  const el = zoomCssReader?.().el ?? flowElFallback()
  el?.classList.add(NAV_CLASS)
  pumpZoomCssWhileNavigating() // Live CSS every frame for the whole gesture
  notifyNavigating()
}

/** Mark gesture end — release frozen zoom after a short settle. */
export function endBoardNavigating(settleMs = 80): void {
  if (settleTimer) clearTimeout(settleTimer)
  settleTimer = setTimeout(() => {
    settleTimer = null
    if (watchdogTimer) {
      clearTimeout(watchdogTimer)
      watchdogTimer = null
    }
    clearNavigating()
  }, settleMs)
}
