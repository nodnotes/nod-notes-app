// Selected frame overlapped by a front frame: its adjust box must paint above that frame,
// while its content still reads as underneath.
// RF nodes are separate stacking contexts, so chrome cannot escape on its own. Instead the
// selected node is raised (`.tt-front-clip`) and its content shells get a clip-path hole
// wherever a frame that normally paints in front covers them. clip-path also clips hits,
// so clicks in a hole reach the front frame. Chrome over those frames goes semi-transparent
// (per-element masks / opacity — neither clips hits, so chrome stays draggable).

import { useLayoutEffect, type RefObject } from 'react'
import { useStore } from 'reactflow'
import { isFrameDragging, registerFrameDragEndHook } from '@/lib/frame-dragging' // Clip stays put mid-drag

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

/** Selected frames that paint in front of `nodeEl` — the covered frame ranks strictly above them. */
function selectedFrontRank(nodeEl: HTMLElement): number {
  const parent = nodeEl.parentElement
  if (!parent) return 0
  let rank = 0 // 0 = only unselected frames are in front
  parent.querySelectorAll(':scope > .react-flow__node-chatPanel.selected').forEach((el) => {
    const other = el as HTMLElement
    if (other !== nodeEl && paintsInFront(other, nodeEl)) rank += 1 // Multi-selected overlapping frame counts
  })
  return rank
}

type FrontCover = { holes: Box[]; raise: boolean } // holes = visible fills; raise = chrome or fill still covers

function fadeGone(el: HTMLElement, prop: string): boolean {
  const fade = parseFloat(el.style.getPropertyValue(prop)) // Unset → still painted
  return Number.isFinite(fade) && fade <= 0.01
}

/** Overlapping frames in front of `nodeEl`. Hidden fill still raises us when its adjust box is up. */
function frontCover(nodeEl: HTMLElement, panelRect: DOMRect): FrontCover {
  const parent = nodeEl.parentElement
  if (!parent) return { holes: [], raise: false }
  const panelBox: Box = {
    left: panelRect.left - CHROME_REACH_PX, // Include frames that only meet the hanging chrome
    top: panelRect.top - CHROME_REACH_PX,
    right: panelRect.right + CHROME_REACH_PX,
    bottom: panelRect.bottom + CHROME_REACH_PX,
  }
  const holes: Box[] = []
  let raise = false
  parent.querySelectorAll(':scope > .react-flow__node-chatPanel').forEach((el) => {
    const other = el as HTMLElement
    if (other === nodeEl) return
    const fillGone = fadeGone(other, '--tt-overlap-fade') // Fill hidden by size
    const chromeGone = fadeGone(other, '--tt-overlap-chrome') // Adjust box hidden too
    if (fillGone && chromeGone) return // Nothing left to cover us; mid-fade still covers
    if (fillGone) return // Overlap-hide fill is gone — its chrome must not raise frames underneath
    if (!paintsInFront(other, nodeEl)) return
    const fill = other.querySelector('[data-tt-frame-fill="true"]') as HTMLElement | null
    const r = (fill ?? other).getBoundingClientRect() // Fill = visible body (adjust pads excluded)
    if (r.width <= 0 || r.height <= 0) return
    if (r.right <= panelBox.left || r.left >= panelBox.right) return
    if (r.bottom <= panelBox.top || r.top >= panelBox.bottom) return
    raise = true // This frame's box or fill paints over us — including a multi-selected mate
    if (!fillGone) holes.push({ left: r.left, top: r.top, right: r.right, bottom: r.bottom }) // Don't punch out content under an invisible fill
  })
  return { holes, raise }
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

/** Nodes that should stay raised — a class/style rewrite must not drop them. */
const wantRaised = new WeakSet<HTMLElement>()
/** How many frames paint in front — higher rank paints above those frames. */
const raiseRank = new WeakMap<HTMLElement, number>()
/** Per node, puts the raise back when React Flow replaces class or style. */
const raiseGuards = new Map<string, MutationObserver>()

function restoreRaise(nodeEl: HTMLElement): void {
  if (!wantRaised.has(nodeEl)) return // Deselected or nothing in front — leave the stack alone
  const rank = String(raiseRank.get(nodeEl) ?? 0) // Covered frame ranks above the frame covering it
  if (nodeEl.style.getPropertyValue('--tt-front-rank').trim() !== rank) {
    nodeEl.style.setProperty('--tt-front-rank', rank) // React style writes drop the custom prop
  }
  if (!nodeEl.classList.contains(RAISED_CLASS)) nodeEl.classList.add(RAISED_CLASS) // React className writes drop the raise
}

function disconnectRaiseGuard(nodeId: string): void {
  const obs = raiseGuards.get(nodeId) // One observer per selected frame
  if (!obs) return
  obs.disconnect() // Stop before clearClip removes the class, or it would be put back
  raiseGuards.delete(nodeId)
}

function connectRaiseGuard(nodeId: string, nodeEl: HTMLElement): void {
  disconnectRaiseGuard(nodeId) // Replace any guard left from the previous run
  const obs = new MutationObserver(() => restoreRaise(nodeEl)) // Class rewrite only — before the next paint
  // `style` is the drag transform. Watching it ran this guard on every move and rewrote the node under the cursor.
  obs.observe(nodeEl, { attributes: true, attributeFilter: ['class'] })
  raiseGuards.set(nodeId, obs)
}

function clearClip(nodeEl: HTMLElement | null, panel: HTMLElement | null): void {
  if (nodeEl) {
    wantRaised.delete(nodeEl) // Observer must not restore this raise
    raiseRank.delete(nodeEl)
    nodeEl.classList.remove(RAISED_CLASS)
    nodeEl.style.removeProperty('--tt-front-rank')
  }
  clearChromeFade(panel)
  panel?.querySelectorAll(`[${TARGET_ATTR}]`).forEach((el) => {
    const t = el as HTMLElement
    t.style.removeProperty('clip-path')
    t.removeAttribute(TARGET_ATTR)
  })
}

function applyClip(nodeEl: HTMLElement, panel: HTMLElement, solidChrome = false): void {
  const { holes, raise } = frontCover(nodeEl, panel.getBoundingClientRect())
  if (!raise) {
    clearClip(nodeEl, panel) // No front frame still painting over this one
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
  if (solidChrome) clearChromeFade(panel) // Multi-select bare box stays solid — a 40% ring reads as behind
  else applyChromeFade(panel, holes) // Single-select chrome over front frames → semi-transparent
  raiseRank.set(nodeEl, selectedFrontRank(nodeEl)) // Above a multi-selected overlapping frame, not tied with it
  wantRaised.add(nodeEl)
  restoreRaise(nodeEl) // Above the overlapping frame even when that frame is multi-selected too
}

/**
 * nodeInternals is a new Map on every position tick.
 * Treating those as equal while a frame is moving keeps this hook from reclipping
 * (getBoundingClientRect on every frame) on the same frames the transform is moving.
 */
function internalsEqual(prev: unknown, next: unknown): boolean {
  if (prev === next) return true // Same map — selection did not move
  if (prev == null || next == null) return false // Select / deselect still reclips
  return isFrameDragging() // Mid-drag maps are position noise
}

/** Live selected frames — the overlap-fade pump re-applies these mid-zoom (React is frozen then). */
const liveClips = new Map<string, { nodeEl: HTMLElement; panel: HTMLElement; solidChrome: boolean }>()

/** Re-raise / re-clip every live selected frame — call after overlap fade paints a zoom tick. */
export function refreshFrontFrameClips(): void {
  liveClips.forEach(({ nodeEl, panel, solidChrome }) => {
    if (nodeEl.isConnected && panel.isConnected) applyClip(nodeEl, panel, solidChrome) // Mate fade-in/out changes what covers us
  })
}

let dragEndReclipArmed = false // Module can evaluate twice (HMR) — one hook is enough
if (typeof window !== 'undefined' && !dragEndReclipArmed) {
  dragEndReclipArmed = true
  registerFrameDragEndHook(() => {
    requestAnimationFrame(() => refreshFrontFrameClips()) // Final boxes, after the last transform write
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
  rotated: boolean,
  solidChrome = false // Multi-select: bare box, fully opaque over the front frame
): void {
  // Null when off → unselected frames never re-render from this. Equal while dragging so the move does not reclip.
  const internals = useStore((s) => (enabled ? s.nodeInternals : null), internalsEqual)
  const zoom = useStore((s) => (enabled ? s.transform[2] : 1)) // Screen-constant widgets resize with zoom → re-place mask boxes

  useLayoutEffect(() => {
    const panel = panelRef.current
    const nodeEl = (panel?.closest('.react-flow__node') as HTMLElement | null) ?? null
    if (!panel || !nodeEl) return
    if (!enabled || !internals || rotated || solidChrome) {
      disconnectRaiseGuard(nodeId) // Do not put the class back after we drop it
      liveClips.delete(nodeId)
      clearClip(nodeEl, panel) // Multi-select: frame stays put; its bare box is drawn above the frames
      return
    }
    liveClips.set(nodeId, { nodeEl, panel, solidChrome }) // Pump keeps us current while zooming
    connectRaiseGuard(nodeId, nodeEl) // Next className write would hide the box until a drag
    applyClip(nodeEl, panel, solidChrome) // This paint — do not wait for drag to bump zIndex
    const raf = requestAnimationFrame(() => {
      if (isFrameDragging()) return // Move owns the transform — reclip once on release
      if (nodeEl.isConnected && panel.isConnected) applyClip(nodeEl, panel, solidChrome) // After RF writes transforms
    })
    return () => {
      cancelAnimationFrame(raf)
      disconnectRaiseGuard(nodeId)
      liveClips.delete(nodeId)
    }
  }, [internals, zoom, enabled, rotated, solidChrome, nodeId, panelRef])

  useLayoutEffect(() => {
    const panel = panelRef.current
    return () => {
      disconnectRaiseGuard(nodeId) // Unmount must not restore a raise we are clearing
      clearClip((panel?.closest('.react-flow__node') as HTMLElement | null) ?? null, panel)
    }
  }, [panelRef, nodeId])
}
