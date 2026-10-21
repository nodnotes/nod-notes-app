// Hide frames that grow large on screen when they overlap another frame.
// Opt-in via board-menu pref (`nodnotes-hide-large-overlap`); default off.
//
// No opacity fade while zooming — fill stays solid until FADE_HIDE_FRAC, then eases
// out over FADE_HIDE_MS. Size is still flow × live zoom ÷ pane (no getBoundingClientRect
// mid-zoom). Ticked from the board zoom CSS pump every frame.

import { useSyncExternalStore } from 'react'
import type { Node } from 'reactflow'
import { absFlowPosition, nodeFlowSize } from '@/components/use-block-group-drag'
import { refreshFrontFrameClips } from '@/lib/frame-adjust-chrome-occlusion' // Keep selected adjust box above mates mid-zoom

/** View-fraction where the old size-fade used to start (either axis). Kept to place the hide. */
export const FADE_START_FRAC = 0.22

/** View-fraction where the old size-fade used to finish (either axis). */
export const FADE_END_FRAC = 0.55

/**
 * Opacity the old linear fade used as its hide step.
 * The hide view-fraction is where that fade would have crossed this — not a live opacity.
 */
export const FADE_HIDE_CUTOFF = 0.4

/**
 * Overlapping frames stay fully opaque until this pane coverage, then the hide ease runs.
 * Same zoom as the old cutoff (linear fade would have been at FADE_HIDE_CUTOFF).
 */
export const FADE_HIDE_FRAC =
  FADE_START_FRAC + (1 - FADE_HIDE_CUTOFF) * (FADE_END_FRAC - FADE_START_FRAC)

/** How long the hide/show eases. Zoom itself does not fade the fill. */
export const FADE_HIDE_MS = 200

/** Opacity below this → no hit target (clicks pass through to frames behind). Matches hide cutoff. */
export const CLICK_THROUGH_OPACITY = FADE_HIDE_CUTOFF

/** @deprecated Use FADE_END_FRAC. */
export const BIG_VIEW_FRAC = FADE_END_FRAC

type FlowBox = { id: string; x: number; y: number; w: number; h: number; viewFrac: number }

/** Positive-area flow AABB overlap (zoom-invariant). */
function flowBoxesOverlap(a: FlowBox, b: FlowBox): boolean {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h
}

function stylePx(v: unknown): number {
  if (typeof v === 'number' && Number.isFinite(v) && v > 0) return v
  if (typeof v === 'string') {
    const n = parseFloat(v)
    if (Number.isFinite(n) && n > 0) return n
  }
  return 0
}

/**
 * Best flow size for overlap fade.
 * RF/metadata often keep a place-seed or fill stub while the panel has already hugged larger —
 * always Math.max with the painted panel (same truth chat-panel pushAabb uses).
 * offsetWidth is flow CSS px (viewport scale is on the parent) — safe mid-zoom, unlike gBCR.
 */
function frameFlowSize(node: Node): { width: number; height: number } {
  const sw = stylePx(node.style?.width)
  const sh = stylePx(node.style?.height)
  const meta = (node.data as { promptMessage?: { metadata?: Record<string, unknown> } } | undefined)
    ?.promptMessage?.metadata
  const dims = meta?.resizeDimensions as { width?: unknown; height?: unknown } | undefined
  const mw = typeof dims?.width === 'number' && dims.width > 0 ? dims.width : stylePx(dims?.width)
  const mh = typeof dims?.height === 'number' && dims.height > 0 ? dims.height : stylePx(dims?.height)
  const nw = typeof node.width === 'number' && node.width > 0 ? node.width : 0
  const nh = typeof node.height === 'number' && node.height > 0 ? node.height : 0
  const measured = (node as Node & { measured?: { width?: number; height?: number } }).measured
  const msw = typeof measured?.width === 'number' && measured.width > 0 ? measured.width : 0
  const msh = typeof measured?.height === 'number' && measured.height > 0 ? measured.height : 0
  let width = Math.max(nw, sw, mw, msw)
  let height = Math.max(nh, sh, mh, msh)
  // Prefer panel over RF node — hug/max-content lives on the panel; node box can lag
  const panel = resolvePanel(node.id)
  const domEl = panel ?? resolveNodeEl(node.id)
  if (domEl) {
    const dw = domEl.offsetWidth
    const dh = domEl.offsetHeight
    if (dw > 0) width = Math.max(width, dw)
    if (dh > 0) height = Math.max(height, dh)
  }
  if (width > 0 && height > 0) return { width, height }
  return nodeFlowSize(node)
}

/**
 * Opacity for an overlapping frame from its max axis coverage of the pane.
 * Solid until FADE_HIDE_FRAC, then 0. The 0 is painted with a CSS opacity ease
 * (FADE_HIDE_MS) — this value is the target, not the tween.
 */
export function opacityFromViewFrac(viewFrac: number): number {
  return viewFrac >= FADE_HIDE_FRAC ? 0 : 1
}

/** Fill + adjust-chrome opacities for one frame. */
export type OverlapFadeOp = { fill: number; chrome: number }

/**
 * Per-frame opacities from flow geometry × zoom (fast, layout-free).
 * - Large-on-view frames that overlap others → fill fades with size.
 * - Frames overlapped by a large mate → unchanged (content + adjust box stay).
 * Overlap tested in flow space so pan/zoom do not reshuffle pairs mid-gesture.
 */
export function computeLargeOverlapOpacities(
  nodes: Node[],
  viewport: { x: number; y: number; zoom: number },
  paneW: number,
  paneH: number,
  skipIds: ReadonlySet<string>
): Map<string, OverlapFadeOp> {
  const out = new Map<string, OverlapFadeOp>()
  const zoom = Math.max(0.01, viewport.zoom)
  if (paneW <= 0 || paneH <= 0) return out

  const frames: FlowBox[] = []
  for (const node of nodes) {
    if (node.type !== 'chatPanel') continue
    if (node.hidden) continue
    const size = frameFlowSize(node)
    const abs = absFlowPosition(node, nodes)
    const screenW = size.width * zoom
    const screenH = size.height * zoom
    if (screenW < 1 || screenH < 1) continue
    const viewFrac = Math.max(screenW / paneW, screenH / paneH)
    frames.push({
      id: node.id,
      x: abs.x,
      y: abs.y,
      w: size.width,
      h: size.height,
      viewFrac,
    })
  }

  for (let i = 0; i < frames.length; i++) {
    const a = frames[i]
    if (skipIds.has(a.id)) {
      out.set(a.id, { fill: 1, chrome: 1 })
      continue
    }

    let overlapsSomeone = false
    let maxCovererOp = 0 // Strongest visibility among large overlapping mates
    for (let j = 0; j < frames.length; j++) {
      if (i === j) continue
      if (!flowBoxesOverlap(a, frames[j])) continue
      overlapsSomeone = true
      const b = frames[j]
      // Mate is large enough to hide — it can cover us
      if (b.viewFrac >= FADE_HIDE_FRAC) {
        maxCovererOp = Math.max(maxCovererOp, opacityFromViewFrac(b.viewFrac))
      }
    }

    if (a.viewFrac >= FADE_HIDE_FRAC && overlapsSomeone) {
      // Large overlapping frame — hide fill (eased in paint); adjust box stays
      out.set(a.id, { fill: opacityFromViewFrac(a.viewFrac), chrome: 1 })
    } else if (maxCovererOp > 0) {
      // Under a large mate: content + adjust box both stay (box paints above the mate)
      out.set(a.id, { fill: 1, chrome: 1 })
    } else {
      out.set(a.id, { fill: 1, chrome: 1 })
    }
  }
  return out
}

/**
 * Furthest-out scale at which every overlapping frame is still under the hide step.
 * 200% must sit here (or further out) or a giant frame stays hidden at the fit stop.
 * Null when nothing can hide (one frame, no overlap, or empty pane).
 */
export function zoomToRevealLargeOverlap(
  nodes: Node[],
  paneW: number,
  paneH: number
): number | null {
  if (paneW <= 0 || paneH <= 0) return null // Pane not measured — keep the fit floor
  const frames: FlowBox[] = []
  for (const node of nodes) {
    if (node.type !== 'chatPanel' || node.hidden) continue // Same set the hide tick uses
    const size = frameFlowSize(node)
    if (size.width < 1 || size.height < 1) continue
    const abs = absFlowPosition(node, nodes)
    frames.push({
      id: node.id,
      x: abs.x,
      y: abs.y,
      w: size.width,
      h: size.height,
      viewFrac: 0, // Overlap is flow-space — zoom does not change pairs
    })
  }
  if (frames.length < 2) return null // Hide only runs when two frames overlap
  // Strictly under FADE_HIDE_FRAC so viewFrac >= hide still cannot fire at 200%
  const revealFrac = FADE_HIDE_FRAC * 0.98
  let furthest: number | null = null
  for (let i = 0; i < frames.length; i++) {
    const a = frames[i]
    let overlapsSomeone = false
    for (let j = 0; j < frames.length; j++) {
      if (i === j) continue
      if (!flowBoxesOverlap(a, frames[j])) continue
      overlapsSomeone = true
      break
    }
    if (!overlapsSomeone) continue // Isolated frames never hide — don't pull 200% for them
    const zShow = revealFrac * Math.min(paneW / a.w, paneH / a.h) // viewFrac = max(w z / paneW, h z / paneH)
    if (!(zShow > 0) || !Number.isFinite(zShow)) continue
    furthest = furthest == null ? zShow : Math.min(furthest, zShow) // Largest overlapping frame wins
  }
  return furthest
}

/** @deprecated Prefer computeLargeOverlapOpacities. */
export function computeLargeOverlapHideIds(
  nodes: Node[],
  viewport: { x: number; y: number; zoom: number },
  paneW: number,
  paneH: number,
  skipIds: ReadonlySet<string>
): Set<string> {
  const hide = new Set<string>()
  for (const [id, op] of computeLargeOverlapOpacities(nodes, viewport, paneW, paneH, skipIds)) {
    if (op.fill <= 0.02 && op.chrome <= 0.02) hide.add(id)
  }
  return hide
}

// —— Live tick context (BoardFlow) + DOM paint ——

export type LargeOverlapFadeContext = {
  enabled: boolean
  getNodes: () => Node[]
  getViewport: () => { x: number; y: number; zoom: number }
  getPaneSize: () => { width: number; height: number }
}

let fadeCtx: LargeOverlapFadeContext | null = null
let opacityById = new Map<string, OverlapFadeOp>()
/** Latest computed opacities — hide tween may withhold 0 from opacityById until the ease ends. */
let desiredById = new Map<string, OverlapFadeOp>()
let hideEpoch = 0
/** Frames whose fill is easing to 0; store keeps the pre-hide opacity so hits stay until it's gone. */
const hideTweenIds = new Set<string>()
/** Frames easing from hidden back to solid. */
const showTweenIds = new Set<string>()
const tweenGen = new Map<string, number>()
const listeners = new Set<() => void>()
/** Cached panel shells / RF nodes — avoid querySelector every zoom frame. */
const panelCache = new Map<string, HTMLElement>()
const nodeCache = new Map<string, HTMLElement>()

const FULL_OP: OverlapFadeOp = { fill: 1, chrome: 1 }

/** Adjust-box stroke. Faded value matches the wrap-line light blue. */
const ADJUST_BLUE = '#3b82f6'
const ADJUST_BLUE_FADED = '#93c5fd'

/** Ease target for the adjust-box stroke. CSS transitions it while `.tt-overlap-hide-tween` is on. */
function paintAdjustBlue(nodeEl: HTMLElement, faded: boolean): void {
  nodeEl.style.setProperty('--tt-adjust-blue', faded ? ADJUST_BLUE_FADED : ADJUST_BLUE)
}

function notify(): void {
  listeners.forEach((fn) => fn())
}

/** True while a hide ease is running or any frame's target fill is gone. */
function anyFramesZoomHidden(): boolean {
  if (hideTweenIds.size > 0) return true // Hide ease just started — show the nav cue now
  for (const op of desiredById.values()) {
    if (op.fill <= 0.02) return true // Already hidden (tween finished)
  }
  return false
}

/**
 * Board root flag for the Free-nav hide cue. Set as soon as a hide starts so the
 * caret eases in with the fill; drop it when every frame is showing again.
 */
function syncNavHideZoomCaret(): void {
  if (typeof document === 'undefined') return
  const root = document.querySelector('[data-board-root]')
  if (!root) return
  const next = anyFramesZoomHidden()
  if (next === root.hasAttribute('data-tt-frames-zoom-hidden')) return // Same as last paint
  if (next) root.setAttribute('data-tt-frames-zoom-hidden', '')
  else root.removeAttribute('data-tt-frames-zoom-hidden')
}

function resolveNodeEl(id: string): HTMLElement | null {
  const cached = nodeCache.get(id)
  if (cached && cached.isConnected) return cached
  if (typeof document === 'undefined') return null
  const nodeEl = document.querySelector(
    `.react-flow__node[data-id="${CSS.escape(id)}"]`
  ) as HTMLElement | null
  if (nodeEl) nodeCache.set(id, nodeEl)
  else nodeCache.delete(id)
  return nodeEl
}

function resolvePanel(id: string): HTMLElement | null {
  const cached = panelCache.get(id)
  if (cached && cached.isConnected) return cached
  const nodeEl = resolveNodeEl(id)
  const panel =
    (nodeEl?.querySelector('[data-panel-container="true"]') as HTMLElement | null) ?? nodeEl
  if (panel) panelCache.set(id, panel)
  else panelCache.delete(id)
  return panel
}

/** Fill + adjust chrome that used to get inline opacity (legacy cleanup). */
function resolveFadeFills(id: string): HTMLElement[] {
  const nodeEl = resolveNodeEl(id)
  if (!nodeEl) return []
  return Array.from(
    nodeEl.querySelectorAll(
      '[data-tt-frame-fill="true"], [data-tt-adjust-ring], [data-frame-chrome], [data-tt-connection-indicator]'
    )
  ) as HTMLElement[]
}

/** Clear hit-target / fade overrides on one frame. */
function clearFadeDom(id: string): void {
  const nodeEl = resolveNodeEl(id)
  // Legacy: older builds wrote opacity on panel / fill — strip if present
  const panel = resolvePanel(id)
  if (panel) {
    panel.style.removeProperty('opacity')
    panel.style.removeProperty('pointer-events')
    panel.style.removeProperty('visibility')
  }
  for (const fill of resolveFadeFills(id)) {
    fill.style.removeProperty('opacity')
    fill.style.removeProperty('visibility')
  }
  if (nodeEl) {
    nodeEl.style.removeProperty('pointer-events')
    nodeEl.style.removeProperty('--tt-overlap-fade')
    nodeEl.style.removeProperty('--tt-overlap-chrome')
    nodeEl.style.removeProperty('--tt-overlap-hide-ms')
    nodeEl.style.removeProperty('--tt-adjust-blue')
    nodeEl.removeAttribute('data-tt-overlap-fade')
    nodeEl.classList.remove('tt-overlap-fade-pass', 'tt-overlap-hide-tween')
  }
  hideTweenIds.delete(id)
  showTweenIds.delete(id)
  tweenGen.set(id, (tweenGen.get(id) ?? 0) + 1) // Stale hide timeout must not re-apply click-through
  panelCache.delete(id)
  nodeCache.delete(id)
}

/** Ease a hidden fill back to solid, then drop the fade vars so zoom stays unfaded. */
function armShowTween(id: string, nodeEl: HTMLElement): void {
  const gen = (tweenGen.get(id) ?? 0) + 1 // Cancels an in-flight hide timeout
  tweenGen.set(id, gen)
  nodeEl.classList.add('tt-overlap-hide-tween')
  nodeEl.style.setProperty('--tt-overlap-hide-ms', `${FADE_HIDE_MS}ms`)
  window.setTimeout(() => {
    if (tweenGen.get(id) !== gen) return
    showTweenIds.delete(id)
    nodeEl.classList.remove('tt-overlap-hide-tween')
    if (desiredById.get(id)?.fill === 0) return // Hid again before the show finished
    if (!nodeEl.isConnected) return
    nodeEl.style.removeProperty('--tt-overlap-fade')
    nodeEl.style.removeProperty('--tt-overlap-chrome')
    nodeEl.style.removeProperty('--tt-overlap-hide-ms')
    nodeEl.style.removeProperty('--tt-adjust-blue')
    nodeEl.removeAttribute('data-tt-overlap-fade')
    nodeEl.style.removeProperty('pointer-events')
    nodeEl.classList.remove('tt-overlap-fade-pass')
  }, FADE_HIDE_MS)
}

function armHideTween(id: string, nodeEl: HTMLElement): void {
  const gen = (tweenGen.get(id) ?? 0) + 1
  tweenGen.set(id, gen)
  nodeEl.classList.add('tt-overlap-hide-tween')
  nodeEl.style.setProperty('--tt-overlap-hide-ms', `${FADE_HIDE_MS}ms`)
  window.setTimeout(() => {
    if (tweenGen.get(id) !== gen) return
    nodeEl.classList.remove('tt-overlap-hide-tween')
    if (!hideTweenIds.has(id)) return
    hideTweenIds.delete(id)
    const want = desiredById.get(id)
    if (!want || want.fill !== 0) return // Zoomed back out during the ease
    const prev = opacityById.get(id)
    if (!prev || prev.fill !== 0) {
      const next = new Map(opacityById)
      next.set(id, { fill: 0, chrome: want.chrome })
      opacityById = next
      hideEpoch += 1
      notify() // React click-through waits until the fill has actually eased out
    }
    if (!nodeEl.isConnected) return
    nodeEl.style.setProperty('pointer-events', 'none', 'important')
    nodeEl.classList.add('tt-overlap-fade-pass')
  }, FADE_HIDE_MS)
}

/**
 * Drive fade via CSS vars on the RF node, not inline opacity —
 * selected-frame React reconciles wipe inline styles on fill/chrome every tick.
 * `--tt-overlap-fade` → fill; `--tt-overlap-chrome` → adjust box. Click-through
 * only once the hide ease has finished (mid-fade and the ease stay hittable).
 * The hide eases; zoom before FADE_HIDE_FRAC does not change fill opacity.
 */
function paintOpacitiesOnDom(map: Map<string, OverlapFadeOp>): void {
  if (typeof document === 'undefined') return
  const seen = new Set<string>()
  for (const [id, op] of map) {
    seen.add(id)
    const nodeEl = resolveNodeEl(id)
    if (!nodeEl) continue
    const fill = Math.max(0, Math.min(1, op.fill))
    const chrome = Math.max(0, Math.min(1, op.chrome))
    const prevFill = opacityById.get(id)?.fill ?? 1
    const active = fill < 0.999 || chrome < 0.999
    if (!active) {
      // Still hidden or mid-hide — ease back to solid instead of popping the fill on
      if (
        showTweenIds.has(id) ||
        hideTweenIds.has(id) ||
        nodeEl.classList.contains('tt-overlap-hide-tween') ||
        nodeEl.hasAttribute('data-tt-overlap-fade')
      ) {
        if (!showTweenIds.has(id)) {
          showTweenIds.add(id)
          hideTweenIds.delete(id) // Don't commit click-through when the hide ease is reversed
          const alreadyTweening = nodeEl.classList.contains('tt-overlap-hide-tween')
          armShowTween(id, nodeEl)
          if (alreadyTweening) {
            nodeEl.style.setProperty('--tt-overlap-fade', '1') // Class already on — retarget this frame
            paintAdjustBlue(nodeEl, false) // Stroke eases back to blue with the fill
          } else {
            requestAnimationFrame(() => {
              if (!nodeEl.isConnected || !showTweenIds.has(id)) return
              nodeEl.style.setProperty('--tt-overlap-fade', '1') // From 0 next frame so the ease runs
              paintAdjustBlue(nodeEl, false)
            })
          }
        }
        nodeEl.setAttribute('data-tt-overlap-fade', '')
        nodeEl.style.setProperty('--tt-overlap-chrome', '1')
        nodeEl.style.removeProperty('pointer-events')
        nodeEl.classList.remove('tt-overlap-fade-pass')
        continue
      }
      hideTweenIds.delete(id)
      tweenGen.set(id, (tweenGen.get(id) ?? 0) + 1)
      nodeEl.style.removeProperty('--tt-overlap-fade')
      nodeEl.style.removeProperty('--tt-overlap-chrome')
      nodeEl.style.removeProperty('--tt-overlap-hide-ms')
      nodeEl.style.removeProperty('--tt-adjust-blue')
      nodeEl.removeAttribute('data-tt-overlap-fade')
      nodeEl.style.removeProperty('pointer-events')
      nodeEl.classList.remove('tt-overlap-fade-pass', 'tt-overlap-hide-tween')
      continue
    }
    nodeEl.style.setProperty('--tt-overlap-chrome', String(chrome))
    nodeEl.setAttribute('data-tt-overlap-fade', '')
    const enteringHide = fill === 0 && prevFill > FADE_HIDE_CUTOFF && !hideTweenIds.has(id)
    if (enteringHide) {
      showTweenIds.delete(id) // A new hide replaces an in-flight show
      hideTweenIds.add(id)
      armHideTween(id, nodeEl)
      // Leave --tt-overlap-fade at the pre-hide value this frame so the ease has a from-state
      requestAnimationFrame(() => {
        if (!nodeEl.isConnected || !hideTweenIds.has(id)) return
        nodeEl.style.setProperty('--tt-overlap-fade', '0')
        paintAdjustBlue(nodeEl, true) // Stroke eases blue → light blue with the fill
      })
      nodeEl.style.removeProperty('pointer-events')
      nodeEl.classList.remove('tt-overlap-fade-pass')
      continue
    }
    if (hideTweenIds.has(id) && fill === 0) continue // Ease owns the var until it finishes
    if (fill > 0 && hideTweenIds.has(id)) hideTweenIds.delete(id) // Zoomed back out mid-hide
    nodeEl.style.setProperty('--tt-overlap-fade', String(fill))
    // Fully gone (not mid-ease): pass clicks through. Hide ease withholds that until it ends.
    const passThrough = fill < CLICK_THROUGH_OPACITY && !hideTweenIds.has(id)
    if (passThrough) {
      paintAdjustBlue(nodeEl, true) // Stay light blue once the ease has finished
      nodeEl.style.setProperty('pointer-events', 'none', 'important')
      nodeEl.classList.add('tt-overlap-fade-pass')
    } else {
      nodeEl.style.removeProperty('pointer-events')
      nodeEl.classList.remove('tt-overlap-fade-pass')
    }
  }
  for (const id of opacityById.keys()) {
    if (seen.has(id)) continue
    clearFadeDom(id)
  }
  refreshFrontFrameClips() // Mates fading in/out mid-zoom change what covers the selected frame
  syncNavHideZoomCaret() // Free-nav caret: on while any large overlapping frame is hidden
}

/**
 * BoardFlow registers getters; zoom pump calls tickLargeOverlapFade every frame.
 * Passing null only drops the tick source — does **not** clear painted fades
 * (cleanup/remount used to wipe mid-gesture and leave fade dead until a full recompute).
 */
export function setLargeOverlapFadeContext(next: LargeOverlapFadeContext | null): void {
  fadeCtx = next
}

/** Drop cached RF node / panel elements (call after drag — RF may remount the node). */
export function invalidateLargeOverlapFadeDomCache(): void {
  panelCache.clear()
  nodeCache.clear()
}

/**
 * Apply fade for the current (or provided) zoom. Called from the board zoom CSS pump
 * and onMove — must stay cheap (flow math only).
 * @param includeDragging — drag-stop: RF may still flag the mover as dragging for a frame;
 *   force it into the fade math so post-move zoom/size fade does not stick opaque.
 */
export function tickLargeOverlapFade(
  liveZoom?: number,
  opts?: { includeDragging?: boolean }
): void {
  if (!fadeCtx?.enabled) return
  const nodes = fadeCtx.getNodes()
  const vp = { ...fadeCtx.getViewport() }
  if (typeof liveZoom === 'number' && liveZoom > 0) vp.zoom = liveZoom
  const pane = fadeCtx.getPaneSize()
  if (pane.width <= 0 || pane.height <= 0) return // Pane not measured yet — keep last paint
  const skip = new Set<string>()
  if (!opts?.includeDragging) {
    for (const n of nodes) {
      if (n.dragging) skip.add(n.id) // Mid-drag stays opaque; mates still update
    }
  }
  publishLargeOverlapOpacities(
    computeLargeOverlapOpacities(nodes, vp, pane.width, pane.height, skip)
  )
}

/** Publish fade opacities + paint DOM. */
export function publishLargeOverlapOpacities(next: Map<string, OverlapFadeOp>): void {
  desiredById = next
  // Always paint — even when values are unchanged, drag may have remounted the node DOM
  paintOpacitiesOnDom(next)
  // Hold the pre-hide fill in the store so React click-through waits out the ease
  const stored = new Map(next)
  for (const id of hideTweenIds) {
    const want = next.get(id)
    const prev = opacityById.get(id)
    if (want && want.fill === 0 && prev && prev.fill > 0) stored.set(id, prev)
  }
  next = stored
  let changed = next.size !== opacityById.size
  if (!changed) {
    for (const [id, op] of next) {
      const prev = opacityById.get(id)
      if (
        prev == null ||
        Math.abs(prev.fill - op.fill) > 0.002 ||
        Math.abs(prev.chrome - op.chrome) > 0.002
      ) {
        changed = true
        break
      }
    }
  }
  opacityById = next
  if (!changed) return
  hideEpoch += 1
  notify()
}

/** @deprecated Prefer publishLargeOverlapOpacities. */
export function publishLargeOverlapHideIds(next: Set<string>): void {
  const map = new Map<string, OverlapFadeOp>()
  for (const id of next) map.set(id, { fill: 0, chrome: 0 })
  publishLargeOverlapOpacities(map)
}

/** Clear all fades (pref off / unmount). */
export function clearLargeOverlapOpacities(): void {
  for (const id of [...opacityById.keys()]) clearFadeDom(id)
  panelCache.clear()
  nodeCache.clear()
  desiredById = new Map() // Drop hide targets so the nav caret does not stick
  if (typeof document !== 'undefined') {
    document.querySelector('[data-board-root]')?.removeAttribute('data-tt-frames-zoom-hidden')
  }
  if (opacityById.size === 0) return
  opacityById = new Map()
  hideEpoch += 1
  notify()
}

/** True when this frame must not receive select / drag (clicks pass through). */
export function isLargeOverlapClickThrough(id: string | undefined | null): boolean {
  return getLargeOverlapFillOpacity(id) < CLICK_THROUGH_OPACITY
}

/** Store fill or painted `tt-overlap-fade-pass` — the store can lag the hide ease by ~200ms. */
export function isOverlapHideClickThrough(id: string | undefined | null): boolean {
  if (!id) return false
  if (getLargeOverlapFillOpacity(id) < CLICK_THROUGH_OPACITY) return true
  if (typeof document === 'undefined') return false
  const el = document.querySelector(`.react-flow__node[data-id="${CSS.escape(id)}"]`)
  return el?.classList.contains('tt-overlap-fade-pass') === true
}

/** @deprecated Prefer clearLargeOverlapOpacities. */
export function clearLargeOverlapHideIds(): void {
  clearLargeOverlapOpacities()
}

export function getLargeOverlapFadeOp(id: string | undefined | null): OverlapFadeOp {
  if (!id) return FULL_OP
  return opacityById.get(id) ?? FULL_OP
}

/** Fill opacity (large-frame size fade). */
export function getLargeOverlapFillOpacity(id: string | undefined | null): number {
  return getLargeOverlapFadeOp(id).fill
}

/** Adjust-box / sim / rotate opacity (hides under a large overlapping mate). */
export function getLargeOverlapChromeOpacity(id: string | undefined | null): number {
  return getLargeOverlapFadeOp(id).chrome
}

/** @deprecated Prefer getLargeOverlapFillOpacity. */
export function getLargeOverlapOpacity(id: string | undefined | null): number {
  return getLargeOverlapFillOpacity(id)
}

export function isLargeOverlapHidden(id: string | undefined | null): boolean {
  const op = getLargeOverlapFadeOp(id)
  return op.fill <= 0.02 && op.chrome <= 0.02
}

export function subscribeLargeOverlapHide(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function useLargeOverlapOpacity(id: string | undefined | null): number {
  return useSyncExternalStore(
    subscribeLargeOverlapHide,
    () => {
      void hideEpoch
      return getLargeOverlapFillOpacity(id)
    },
    () => 1
  )
}

/** Adjust chrome opacity — 0 under a large overlapping mate. */
export function useLargeOverlapChromeOpacity(id: string | undefined | null): number {
  return useSyncExternalStore(
    subscribeLargeOverlapHide,
    () => {
      void hideEpoch
      return getLargeOverlapChromeOpacity(id)
    },
    () => 1
  )
}

export function useLargeOverlapHidden(id: string | undefined | null): boolean {
  return useLargeOverlapOpacity(id) <= 0.02
}

export function getLargeOverlapHideEpoch(): number {
  return hideEpoch
}

export function boardPaneElement(): HTMLElement | null {
  if (typeof document === 'undefined') return null
  return (
    (document.querySelector('[data-board-root] .react-flow') as HTMLElement | null) ||
    (document.querySelector('.react-flow') as HTMLElement | null)
  )
}
