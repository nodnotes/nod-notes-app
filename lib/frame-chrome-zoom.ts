// Keep selected-frame chrome exactly constant on screen while the board zooms.
//
// Source of truth = `.react-flow__viewport` CSS transform (what is painted). The RF
// store’s transform[2] can lag until the gesture ends — that was the “only snaps
// after zoom” bug for adjust gutters + ⋮⋮ / add lines.
//
// rAF while a frame is selected: read viewport matrix → publish live zoom (React
// syncExternalStore) + stamp CSS vars / chrome element sizes.
// L/R adjust pad is live from React (`data-tt-chrome-pad-x`); rAF only mirrors it to
// `--tt-adjust-pad-x`. ChatPanelNode re-glues RF XY to the fill origin when pad changes
// so the peach fill (and threads) stay put while the blue gutter reflows.

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
  el.style.setProperty('--tt-thread-inv-zoom', String(1 / Math.max(0.01, z))) // Thread strokes stay screen-constant
  el.style.setProperty('--tt-frame-chrome-boost', String(CHROME_BOOST))
  el.style.setProperty('--tt-frame-ui-scale', String(ui))
  // Line stroke stays flow-scaled (large surface). Dots use fixed local paint + scale(ui).
  el.style.setProperty('--tt-frame-line-w', `${ui}px`)
  el.style.setProperty('--tt-frame-line-hit', `${5 * ui}px`)
  el.style.setProperty('--tt-frame-handle', '10px') // Fixed local paint — scale() keeps screen size
  el.style.setProperty('--tt-frame-handle-border', '1.5px') // Fixed local ring — never subpixel-eaten
  el.style.setProperty('--tt-frame-indicator', '10px')
  el.style.setProperty('--tt-frame-indicator-border', '1.5px')
}

/**
 * Mirror React’s live L/R adjust pad onto `--tt-adjust-pad-x` (connection-point CSS).
 * Pad width itself comes from ChatPanelNode (`adjustChromeXFlow` + fill-origin glue).
 */
function stampAdjustGutters(node: HTMLElement, _zoom: number): void {
  const panel = node.querySelector('[data-panel-container="true"]') as HTMLElement | null
  if (!panel || panel.getAttribute('data-block-node') !== 'true') return
  if (!node.classList.contains('selected')) return
  const live = panel.getAttribute('data-tt-chrome-pad-x')
  if (live == null || live === '') return
  panel.style.setProperty('--tt-adjust-pad-x', `${live}px`)
}

/** Outset + screen-constant size for simulated connection-point dots (frames + drawings). */
function stampConnectionIndicators(panel: HTMLElement, ui: number): void {
  const borderPx = '1.5px' // Same ring as CSS --tt-frame-indicator-border
  const dotPx = '10px' // Fixed local paint — scale(ui) keeps screen size
  const out = 14 * ui // INDICATOR_OUTSET in flow space so distance stays constant on screen
  panel.querySelectorAll(':scope > [data-tt-connection-indicator]').forEach((el) => {
    const dot = el as HTMLElement
    const side = dot.getAttribute('data-tt-connection-indicator')
    dot.style.setProperty('width', dotPx, 'important')
    dot.style.setProperty('height', dotPx, 'important')
    dot.style.setProperty('border-width', borderPx, 'important')
    dot.style.setProperty('border-style', 'solid', 'important')
    dot.style.setProperty('border-radius', '50%', 'important')
    dot.style.setProperty('box-sizing', 'border-box', 'important')
    // translate centers on the edge; scale(ui) keeps the disc screen-constant
    if (side === 'left') {
      dot.style.setProperty('left', `${-out}px`, 'important')
      dot.style.setProperty('top', '50%', 'important')
      dot.style.setProperty('transform', `translate(-50%, -50%) scale(${ui})`, 'important')
    } else if (side === 'right') {
      dot.style.setProperty('right', `${-out}px`, 'important')
      dot.style.setProperty('top', '50%', 'important')
      dot.style.setProperty('transform', `translate(50%, -50%) scale(${ui})`, 'important')
    } else if (side === 'top') {
      dot.style.setProperty('top', `${-out}px`, 'important')
      dot.style.setProperty('left', '50%', 'important')
      dot.style.setProperty('transform', `translate(-50%, -50%) scale(${ui})`, 'important')
    } else if (side === 'bottom') {
      dot.style.setProperty('bottom', `${-out}px`, 'important')
      dot.style.setProperty('left', '50%', 'important')
      dot.style.setProperty('transform', `translate(-50%, 50%) scale(${ui})`, 'important')
    }
    dot.style.setProperty('transform-origin', 'center', 'important')
  })
}

/** Circular corner adjust dots — same screen-constant stamp as frames. */
function stampResizeHandles(node: HTMLElement, ui: number): void {
  const handlePx = '10px' // Fixed local paint — scale(ui) counters board zoom
  const borderPx = '1.5px'
  const handleScale = `translate(-50%, -50%) scale(${ui})` // RF centers on corner
  node.querySelectorAll('.react-flow__resize-control.handle').forEach((el) => {
    const h = el as HTMLElement
    h.style.setProperty('width', handlePx, 'important')
    h.style.setProperty('height', handlePx, 'important')
    h.style.setProperty('min-width', handlePx, 'important')
    h.style.setProperty('min-height', handlePx, 'important')
    h.style.setProperty('max-width', handlePx, 'important') // Kill RF/non-square stretch → pill shapes
    h.style.setProperty('max-height', handlePx, 'important')
    h.style.setProperty('border-width', borderPx, 'important')
    h.style.setProperty('border-style', 'solid', 'important')
    h.style.setProperty('border-radius', '50%', 'important')
    h.style.setProperty('box-sizing', 'border-box', 'important')
    h.style.setProperty('transform', handleScale, 'important')
    h.style.setProperty('transform-origin', 'center', 'important')
  })
}

/** Blue adjust ring stroke width — screen-constant via --tt-frame-line-w. */
function stampAdjustRing(node: HTMLElement, ui: number): void {
  const linePx = `${ui}px`
  node.querySelectorAll('[data-tt-adjust-ring]').forEach((el) => {
    ;(el as HTMLElement).style.boxShadow = `inset 0 0 0 ${linePx} #3b82f6`
  })
}

/** Drawing selection chrome: ring + circular dots + indicators + rotate (no frame gutters). */
function stampFreehandChrome(node: HTMLElement, ui: number): void {
  stampResizeHandles(node, ui)
  stampAdjustRing(node, ui)
  const panel = node.querySelector('[data-panel-container="true"]') as HTMLElement | null
  if (panel) stampConnectionIndicators(panel, ui)
  node.querySelectorAll('[data-frame-chrome]').forEach((el) => {
    const chrome = el as HTMLElement
    chrome.style.setProperty('transform', `scale(${ui})`, 'important')
    chrome.style.setProperty('transform-origin', 'top left', 'important')
  })
}

/** Direct paint for resize dots / ring / indicators / rotate·fit·wrap. */
function stampChromeElements(node: HTMLElement, ui: number, _zoom: number): void {
  const out = 14 * ui // INDICATOR_OUTSET in flow space
  stampResizeHandles(node, ui)
  stampAdjustRing(node, ui)

  const panel = node.querySelector('[data-panel-container="true"]') as HTMLElement | null
  if (panel) stampConnectionIndicators(panel, ui)

  panel?.querySelectorAll('[data-frame-chrome]').forEach((el) => {
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
    '.react-flow__node-chatPanel.selected, .react-flow__node-freehand.selected'
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
    // Frames get full chrome stamp. Drawings share ring + circular dots + indicators —
    // do not run stampChromeElements (it also stamps chat-link cues / frame chrome margins).
    if (node.classList.contains('react-flow__node-chatPanel')) {
      stampChromeElements(node, ui, z)
      stampAdjustGutters(node, z)
    } else if (node.classList.contains('react-flow__node-freehand')) {
      stampFreehandChrome(node, ui) // Ring + circular dots + indicators + rotate
    }
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
  const hasSelected = !!flow?.querySelector(
    '.react-flow__node-chatPanel.selected, .react-flow__node-freehand.selected'
  )
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
