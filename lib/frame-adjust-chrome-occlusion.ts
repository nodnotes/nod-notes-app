// Selected frame overlapped by a front frame: its adjust box must paint above that frame,
// while its content still reads as underneath.
// RF nodes are separate stacking contexts, so chrome cannot escape on its own. Instead the
// selected node is raised (`.tt-front-clip`) and its content shells get a clip-path hole
// wherever a frame that normally paints in front covers them. clip-path also clips hits,
// so clicks in a hole reach the front frame. Chrome over those frames goes semi-transparent
// (per-element masks / opacity — neither clips hits, so chrome stays draggable).

import { useLayoutEffect, type RefObject } from 'react'
import { useStore } from 'reactflow'

/** Node class: raised + click-through shell (globals.css). */
const RAISED_CLASS = 'tt-front-clip'
/** Content shells that get clipped (direct children of the panel). */
const TARGET_SELECTOR =
  ':scope > [data-tt-frame-fill="true"], :scope > [data-tt-frame-chrome-bottom], :scope > [data-tt-db-rows-reveal]'
/** Marks clipped shells so CSS re-arms their hits inside the click-through node. */
const TARGET_ATTR = 'data-tt-front-clip-target'
/** Screen px around the panel where chrome hangs (corners, sim points, rotate row). */
const CHROME_REACH_PX = 100
/** Chrome alpha over a front frame — reads as "behind, but still adjustable". */
const OVER_FRONT_ALPHA = 0.4

type Box = { left: number; top: number; right: number; bottom: number }

function inlineZ(el: HTMLElement): number {
  const z = parseInt(el.style.zIndex, 10) // RF writes node.zIndex inline; CSS raise uses !important
  return Number.isFinite(z) ? z : 0
}

/** True when `other` paints above `self` at their normal (un-raised) stack level. */
function paintsInFront(other: HTMLElement, self: HTMLElement): boolean {
  const zo = inlineZ(other)
  const zs = inlineZ(self)
  if (zo !== zs) return zo > zs
  return (self.compareDocumentPosition(other) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0 // Later sibling wins
}

/** Screen boxes of overlapping frames that normally paint in front of `nodeEl`. */
function frontFrameBoxes(nodeEl: HTMLElement, panelRect: DOMRect): Box[] {
  const parent = nodeEl.parentElement
  if (!parent) return []
  const panelBox: Box = {
    left: panelRect.left - CHROME_REACH_PX, // Include frames that only meet the hanging chrome
    top: panelRect.top - CHROME_REACH_PX,
    right: panelRect.right + CHROME_REACH_PX,
    bottom: panelRect.bottom + CHROME_REACH_PX,
  }
  const out: Box[] = []
  parent.querySelectorAll(':scope > .react-flow__node-chatPanel').forEach((el) => {
    const other = el as HTMLElement
    if (other === nodeEl) return
    const fade = parseFloat(other.style.getPropertyValue('--tt-overlap-fade')) // Live overlap size-fade of the mate
    if (Number.isFinite(fade) && fade <= 0.01) return // Faded away — nothing covers us; mid-fade still covers
    if (!paintsInFront(other, nodeEl)) return
    const fill = other.querySelector('[data-tt-frame-fill="true"]') as HTMLElement | null
    const r = (fill ?? other).getBoundingClientRect() // Fill = visible body (adjust pads excluded)
    if (r.width <= 0 || r.height <= 0) return
    if (r.right <= panelBox.left || r.left >= panelBox.right) return
    if (r.bottom <= panelBox.top || r.top >= panelBox.bottom) return
    out.push({ left: r.left, top: r.top, right: r.right, bottom: r.bottom })
  })
  return out
}

/** evenodd path: huge outer rect (keeps shadows) minus each hole, in the target's local px. */
function holePath(target: HTMLElement, holes: Box[]): string | null {
  const r = target.getBoundingClientRect()
  if (r.width <= 0 || r.height <= 0) return null
  const sx = target.offsetWidth / r.width // Screen → local (RF zoom / CSS scale)
  const sy = target.offsetHeight / r.height
  let d = 'M-100000 -100000 H100000 V100000 H-100000 Z'
  let any = false
  for (const h of holes) {
    if (h.right <= r.left || h.left >= r.right || h.bottom <= r.top || h.top >= r.bottom) continue
    const x = (h.left - r.left) * sx
    const y = (h.top - r.top) * sy
    const w = (h.right - h.left) * sx
    const hh = (h.bottom - h.top) * sy
    d += ` M${x} ${y} h${w} v${hh} h${-w} Z`
    any = true
  }
  return any ? `path(evenodd, "${d}")` : null
}

const MASK_PROPS = ['mask-image', 'mask-size', 'mask-repeat', 'mask-mode'] as const

/** Long chrome (ring, resize lines) — masked on its own box so only the part over a front frame fades. */
const LINE_SELECTOR = ':scope > [data-tt-adjust-ring], :scope > .react-flow__resize-control.line'

/** Small chrome widgets that fade as one unit (no half-faded dot across a front-frame edge). */
const WIDGET_SELECTOR =
  '.react-flow__resize-control.handle, [data-tt-connection-indicator]' // Rotate row stays opaque — actions, not adjust box

/** Widget over a front frame — faded whole by its own opacity (globals.css). */
const OVER_FRONT_ATTR = 'data-tt-over-front'

/** Luminance gray for OVER_FRONT_ALPHA (luminance mask: white = shown). */
const DIM_FILL = (() => {
  const v = Math.round(OVER_FRONT_ALPHA * 255)
  return `rgb(${v},${v},${v})`
})()

function centerInHoles(b: DOMRect, holes: Box[]): boolean {
  const cx = b.left + b.width / 2
  const cy = b.top + b.height / 2
  return holes.some((h) => cx >= h.left && cx <= h.right && cy >= h.top && cy <= h.bottom)
}

/**
 * Luminance mask on `el`'s own box: white, gray where front frames cover it, black discs under
 * faded widgets (a translucent dot must not show the ring corner through it); cleared if none apply.
 */
function maskLine(el: HTMLElement, holes: Box[], cutouts: DOMRect[]): void {
  const r = el.getBoundingClientRect()
  const meets = (b: Box) => b.right > r.left && b.left < r.right && b.bottom > r.top && b.top < r.bottom
  const hit = holes.filter(meets)
  const cuts = cutouts.filter(meets)
  if (r.width <= 0 || r.height <= 0 || (hit.length === 0 && cuts.length === 0)) {
    for (const p of MASK_PROPS) el.style.removeProperty(p)
    return
  }
  const sx = el.offsetWidth / r.width // Screen → element-local px
  const sy = el.offsetHeight / r.height
  const w = el.offsetWidth
  const h = el.offsetHeight
  let body = `<rect width="${w}" height="${h}" fill="white"/>` // Opaque field
  for (const b of hit) {
    const x = (b.left - r.left) * sx
    const y = (b.top - r.top) * sy
    body += `<rect x="${x}" y="${y}" width="${(b.right - b.left) * sx}" height="${(b.bottom - b.top) * sy}" fill="${DIM_FILL}"/>`
  }
  for (const c of cuts) {
    const cx = (c.left + c.width / 2 - r.left) * sx // Widget center in element-local px
    const cy = (c.top + c.height / 2 - r.top) * sy
    body += `<ellipse cx="${cx}" cy="${cy}" rx="${(c.width / 2) * sx}" ry="${(c.height / 2) * sy}" fill="black"/>` // Widgets are discs
  }
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">${body}</svg>`
  el.style.setProperty('mask-image', `url("data:image/svg+xml,${encodeURIComponent(svg)}")`)
  el.style.setProperty('mask-mode', 'luminance') // Gray = OVER_FRONT_ALPHA
  el.style.setProperty('mask-size', `${w}px ${h}px`)
  el.style.setProperty('mask-repeat', 'no-repeat')
}

/**
 * Chrome over front frames → semi-transparent. Masks stay inside each element's own box —
 * Chrome can skip a panel mask outside the panel border box (far zoom-out), which
 * half-faded corner dots. Small widgets fade whole by center via OVER_FRONT_ATTR.
 */
function applyChromeFade(panel: HTMLElement, holes: Box[]): void {
  const cutouts: DOMRect[] = [] // Faded widgets — lines are hidden beneath them
  panel.querySelectorAll(WIDGET_SELECTOR).forEach((el) => {
    const widget = el as HTMLElement
    const wb = widget.getBoundingClientRect()
    const faded = wb.width > 0 && centerInHoles(wb, holes)
    widget.toggleAttribute(OVER_FRONT_ATTR, faded) // Whole-widget fade by center
    if (faded) cutouts.push(wb)
  })
  panel.querySelectorAll(LINE_SELECTOR).forEach((el) => maskLine(el as HTMLElement, holes, cutouts))
}

function clearChromeFade(panel: HTMLElement | null): void {
  if (!panel) return
  panel.querySelectorAll(LINE_SELECTOR).forEach((el) => {
    for (const p of MASK_PROPS) (el as HTMLElement).style.removeProperty(p)
  })
  panel.querySelectorAll(`[${OVER_FRONT_ATTR}]`).forEach((el) => el.removeAttribute(OVER_FRONT_ATTR)) // Widgets back to full
}

function clearClip(nodeEl: HTMLElement | null, panel: HTMLElement | null): void {
  nodeEl?.classList.remove(RAISED_CLASS)
  clearChromeFade(panel)
  panel?.querySelectorAll(`[${TARGET_ATTR}]`).forEach((el) => {
    const t = el as HTMLElement
    t.style.removeProperty('clip-path')
    t.removeAttribute(TARGET_ATTR)
  })
}

function applyClip(nodeEl: HTMLElement, panel: HTMLElement): void {
  const holes = frontFrameBoxes(nodeEl, panel.getBoundingClientRect())
  if (holes.length === 0) {
    clearClip(nodeEl, panel)
    return
  }
  panel.querySelectorAll(TARGET_SELECTOR).forEach((el) => {
    const t = el as HTMLElement
    if (t.dataset.ttShapeFill) return // Silhouette owns clip-path — leave it
    const path = holePath(t, holes)
    if (path) {
      t.style.setProperty('clip-path', path)
      t.setAttribute(TARGET_ATTR, '')
    } else {
      t.style.removeProperty('clip-path') // No hole here — keep hits via the target attr
      t.setAttribute(TARGET_ATTR, '')
    }
  })
  applyChromeFade(panel, holes) // Chrome over front frames → semi-transparent
  nodeEl.classList.add(RAISED_CLASS) // Front frame meets panel or hanging chrome
}

/** Live selected frames — the overlap-fade pump re-applies these mid-zoom (React is frozen then). */
const liveClips = new Map<string, { nodeEl: HTMLElement; panel: HTMLElement }>()

/** Re-raise / re-clip every live selected frame — call after overlap fade paints a zoom tick. */
export function refreshFrontFrameClips(): void {
  liveClips.forEach(({ nodeEl, panel }) => {
    if (nodeEl.isConnected && panel.isConnected) applyClip(nodeEl, panel) // Mate fade-in/out changes what covers us
  })
}

/**
 * Keep the selected frame's adjust box above overlapping front frames.
 * Recomputes on any RF node change (move / resize / reorder); pan + zoom keep local holes valid.
 */
export function useFrontFrameContentClip(
  nodeId: string,
  enabled: boolean,
  panelRef: RefObject<HTMLElement | null>,
  rotated: boolean
): void {
  // Stable Map ref; null when off → unselected frames never re-render from this
  const internals = useStore((s) => (enabled ? s.nodeInternals : null))
  const zoom = useStore((s) => (enabled ? s.transform[2] : 1)) // Screen-constant widgets resize with zoom → re-place mask boxes

  useLayoutEffect(() => {
    const panel = panelRef.current
    const nodeEl = (panel?.closest('.react-flow__node') as HTMLElement | null) ?? null
    if (!panel || !nodeEl) return
    if (!enabled || !internals || rotated) {
      liveClips.delete(nodeId)
      clearClip(nodeEl, panel)
      return
    }
    liveClips.set(nodeId, { nodeEl, panel }) // Pump keeps us current while zooming
    const raf = requestAnimationFrame(() => applyClip(nodeEl, panel)) // After RF writes transforms
    return () => {
      cancelAnimationFrame(raf)
      liveClips.delete(nodeId)
    }
  }, [internals, zoom, enabled, rotated, nodeId, panelRef])

  useLayoutEffect(() => {
    const panel = panelRef.current
    return () => clearClip((panel?.closest('.react-flow__node') as HTMLElement | null) ?? null, panel)
  }, [panelRef])
}
