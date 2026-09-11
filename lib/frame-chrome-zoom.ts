// Keep selected-frame chrome exactly constant on screen while the board zooms.
//
// Source of truth = `.react-flow__viewport` CSS transform (what is painted). The RF
// store’s transform[2] can lag until the gesture ends — that was the “only snaps
// after zoom” bug for adjust gutters + ⋮⋮ / add lines.
//
// rAF while a frame is selected: read viewport matrix → publish live zoom (React
// syncExternalStore) + stamp CSS vars / chrome element sizes.

import { adjustChromeXFlow } from '@/lib/frame-adjust-box' // Live L/R pad (grip + gaps)

/** Keep in sync with FRAME_SCREEN_CHROME_BOOST in threads/constants. */
const CHROME_BOOST = 1.4

let raf = 0
let reader: (() => { zoom: number; root: HTMLElement | null }) | null = null
let lastZoomKey = ''
let liveZoom = 1 // Published to React — full precision from viewport CSS
const liveZoomListeners = new Set<() => void>()

/** Current board zoom from the painted viewport (not the possibly-lagging RF store). */
export function getLiveBoardZoom(): number {
  return liveZoom
}

/** Subscribe to live zoom changes (useSyncExternalStore). */
export function subscribeLiveBoardZoom(onStoreChange: () => void): () => void {
  liveZoomListeners.add(onStoreChange)
  return () => liveZoomListeners.delete(onStoreChange)
}

function setLiveZoom(z: number): void {
  if (z === liveZoom) return
  liveZoom = z
  liveZoomListeners.forEach((l) => l())
}

/** BoardFlow registers store fallback + the board’s .react-flow root. */
export function registerFrameChromeZoomReader(
  next: (() => { zoom: number; root: HTMLElement | null }) | null
): void {
  reader = next
  if (next) {
    const { zoom, root } = next()
    const z = readViewportZoom(root) || zoom
    applyFrameChromeZoom(z, root)
    ensureFrameChromeZoomPump()
  }
}

/**
 * Zoom from the viewport’s live CSS matrix (d3/RF paint path).
 * Falls back to 0 when the node is missing (caller uses store).
 */
export function readViewportZoom(root?: HTMLElement | null): number {
  const flow =
    root ||
    (document.querySelector('[data-board-root] .react-flow') as HTMLElement | null) ||
    (document.querySelector('.react-flow') as HTMLElement | null)
  const vp = flow?.querySelector('.react-flow__viewport') as HTMLElement | null
  if (!vp) return 0
  const t = getComputedStyle(vp).transform
  if (!t || t === 'none') return 0
  try {
    const m = new DOMMatrixReadOnly(t)
    const s = Math.hypot(m.a, m.b) // Uniform scale from the 2D matrix
    return s > 0.001 ? s : 0
  } catch {
    return 0
  }
}

function writeChromeVars(el: HTMLElement, z: number, ui: number): void {
  el.style.setProperty('--tt-board-zoom', String(z))
  el.style.setProperty('--tt-frame-chrome-boost', String(CHROME_BOOST))
  el.style.setProperty('--tt-frame-ui-scale', String(ui))
  el.style.setProperty('--tt-frame-line-w', `${ui}px`)
  el.style.setProperty('--tt-frame-line-hit', `${5 * ui}px`)
  el.style.setProperty('--tt-frame-handle', `${7 * ui}px`)
  el.style.setProperty('--tt-frame-handle-border', `${1.5 * ui}px`)
}

/**
 * Live L/R adjust pad — stamped every rAF so gaps stay smooth.
 * RF XY is NOT patched here (that caused post-zoom / mid-zoom frame moves); fill-origin
 * glue runs only on select / deselect / drag-end in ChatPanelNode.
 */
function stampAdjustGutters(node: HTMLElement, zoom: number): void {
  const panel = node.querySelector('[data-panel-container="true"]') as HTMLElement | null
  if (!panel || panel.getAttribute('data-block-node') !== 'true') return
  if (!node.classList.contains('selected')) return
  const fs = parseFloat(panel.getAttribute('data-tt-frame-scale') || '1') || 1
  const pad = adjustChromeXFlow(zoom, fs)
  panel.style.setProperty('--tt-adjust-pad-x', `${pad}px`)
}

/** Direct paint for resize dots / ring / indicators / rotate·fit·wrap. */
function stampChromeElements(node: HTMLElement, ui: number, zoom: number): void {
  const handlePx = `${7 * ui}px`
  const borderPx = `${Math.max(1, 1.5 * ui)}px`
  const linePx = `${ui}px`
  const dotPx = `${8 * ui}px` // Dot size stays screen-constant (boost/zoom)
  // Outset also screen-constant — same distance from the adjust box at every zoom
  const out = 14 * ui

  node.querySelectorAll('.react-flow__resize-control.handle').forEach((el) => {
    const h = el as HTMLElement
    h.style.setProperty('width', handlePx, 'important')
    h.style.setProperty('height', handlePx, 'important')
    h.style.setProperty('min-width', handlePx, 'important')
    h.style.setProperty('min-height', handlePx, 'important')
    h.style.setProperty('border-width', borderPx, 'important')
  })

  node.querySelectorAll('[data-tt-adjust-ring]').forEach((el) => {
    ;(el as HTMLElement).style.boxShadow = `inset 0 0 0 ${linePx} #3b82f6`
  })

  const panel = node.querySelector('[data-panel-container="true"]') as HTMLElement | null
  panel?.querySelectorAll(':scope > [data-tt-connection-indicator]').forEach((el) => {
    const dot = el as HTMLElement
    const side = dot.getAttribute('data-tt-connection-indicator')
    dot.style.setProperty('width', dotPx, 'important')
    dot.style.setProperty('height', dotPx, 'important')
    if (side === 'left') {
      dot.style.setProperty('left', `${-out}px`, 'important')
      dot.style.setProperty('top', '50%', 'important')
      dot.style.setProperty('transform', 'translate(-50%, -50%)', 'important')
    } else if (side === 'right') {
      dot.style.setProperty('right', `${-out}px`, 'important')
      dot.style.setProperty('top', '50%', 'important')
      dot.style.setProperty('transform', 'translate(50%, -50%)', 'important')
    } else if (side === 'top') {
      dot.style.setProperty('top', `${-out}px`, 'important')
      dot.style.setProperty('left', '50%', 'important')
      dot.style.setProperty('transform', 'translate(-50%, -50%)', 'important')
    } else if (side === 'bottom') {
      dot.style.setProperty('bottom', `${-out}px`, 'important')
      dot.style.setProperty('left', '50%', 'important')
      dot.style.setProperty('transform', 'translate(-50%, 50%)', 'important')
    }
  })

  panel?.querySelectorAll(':scope > [data-frame-chrome]').forEach((el) => {
    const chrome = el as HTMLElement
    chrome.style.setProperty('transform', `scale(${ui})`, 'important')
    chrome.style.setProperty('transform-origin', 'top left', 'important')
    chrome.style.setProperty('margin-left', `${-8 * ui}px`, 'important')
    // 2× outset: equal gap box→point and point→rotate/fit/wrap
    chrome.style.setProperty('margin-top', `${28 * ui}px`, 'important')
  })

  panel?.querySelectorAll(':scope > [data-tt-chat-link-cue]').forEach((el) => {
    const cue = el as HTMLElement
    const side = cue.getAttribute('data-tt-chat-link-cue')
    if (side === 'left') cue.style.setProperty('left', `${-out}px`, 'important')
    if (side === 'right') cue.style.setProperty('right', `${-out}px`, 'important')
    if (side === 'top') cue.style.setProperty('top', `${-out}px`, 'important')
    if (side === 'bottom') cue.style.setProperty('top', `calc(100% + ${out}px)`, 'important')
    const inner = cue.firstElementChild as HTMLElement | null
    if (inner) inner.style.transform = `scale(${ui})`
  })
}

/** Apply boost/zoom chrome to the flow root + every selected frame node. */
export function applyFrameChromeZoom(zoom: number, root?: HTMLElement | null): void {
  const z = Math.max(0.01, zoom)
  setLiveZoom(z) // React gutters / ⋮⋮ subscribe here
  const ui = CHROME_BOOST / z
  const zoomKey = z.toFixed(6)
  const flow =
    root ||
    (document.querySelector('[data-board-root] .react-flow') as HTMLElement | null) ||
    (document.querySelector('.react-flow') as HTMLElement | null)
  if (!flow) return

  const selected = flow.querySelectorAll(
    '.react-flow__node-chatPanel.selected'
  ) as NodeListOf<HTMLElement>

  const zoomChanged = zoomKey !== lastZoomKey
  if (zoomChanged) {
    lastZoomKey = zoomKey
    writeChromeVars(flow, z, ui)
  }

  const zStr = String(z)
  selected.forEach((node) => {
    if (zoomChanged || node.style.getPropertyValue('--tt-board-zoom') !== zStr) {
      writeChromeVars(node, z, ui)
    }
    stampChromeElements(node, ui, z)
    stampAdjustGutters(node, z)
  })
}

function tick(): void {
  if (!reader) {
    raf = 0
    return
  }
  const { zoom: storeZoom, root } = reader()
  // Prefer painted viewport matrix — store can lag until gesture end
  const z = readViewportZoom(root) || storeZoom || 1
  applyFrameChromeZoom(z, root)
  const flow =
    root ||
    (document.querySelector('[data-board-root] .react-flow') as HTMLElement | null)
  const hasSelected = !!flow?.querySelector('.react-flow__node-chatPanel.selected')
  if (hasSelected) {
    raf = requestAnimationFrame(tick)
  } else {
    raf = 0
  }
}

/** Ensure the rAF pump is running (call on select / navigate / mount). */
export function ensureFrameChromeZoomPump(): void {
  if (raf) return
  raf = requestAnimationFrame(tick)
}

/** Stop the pump (board unmount). */
export function stopFrameChromeZoomPump(): void {
  if (raf) cancelAnimationFrame(raf)
  raf = 0
  lastZoomKey = ''
  reader = null
}
