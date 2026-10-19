// Fade frames that grow large on screen when they overlap another frame.
// Opt-in via board-menu pref (`nodnotes-hide-large-overlap`); default off.
//
// Opacity tracks **flow size × live zoom ÷ pane** (no getBoundingClientRect mid-zoom —
// layout reads lag the RF viewport transform). Ticked from the board zoom CSS pump
// every frame so continuous wheel/pinch stays in lockstep.

import { useSyncExternalStore } from 'react'
import type { Node } from 'reactflow'
import { absFlowPosition, nodeFlowSize } from '@/components/use-block-group-drag'
import { refreshFrontFrameClips } from '@/lib/frame-adjust-chrome-occlusion' // Keep selected adjust box above mates mid-zoom

/** View-fraction where overlapping frames start to dim (either axis). */
export const FADE_START_FRAC = 0.22

/** View-fraction where overlapping frames are fully gone (either axis). */
export const FADE_END_FRAC = 0.55

/** Opacity below this → no hit target (clicks pass through to frames behind). */
export const CLICK_THROUGH_OPACITY = 0.99

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

/** Best flow size — measured RF, style, or saved resizeDimensions. */
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
  const width = Math.max(nw, sw, mw)
  const height = Math.max(nh, sh, mh)
  if (width > 0 && height > 0) return { width, height }
  return nodeFlowSize(node)
}

/**
 * Opacity for an overlapping frame from its max axis coverage of the pane.
 * Linear across the band (no smoothstep) so continuous zoom feels 1:1 with size.
 */
export function opacityFromViewFrac(viewFrac: number): number {
  if (viewFrac <= FADE_START_FRAC) return 1
  if (viewFrac >= FADE_END_FRAC) return 0
  return 1 - (viewFrac - FADE_START_FRAC) / (FADE_END_FRAC - FADE_START_FRAC)
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
      // Mate is large enough to enter the fade band — it can cover us
      if (b.viewFrac >= FADE_START_FRAC) {
        maxCovererOp = Math.max(maxCovererOp, opacityFromViewFrac(b.viewFrac))
      }
    }

    if (a.viewFrac >= FADE_START_FRAC && overlapsSomeone) {
      // Large overlapping frame — fade fill as it fills the view; adjust box stays
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
let hideEpoch = 0
const listeners = new Set<() => void>()
/** Cached panel shells / RF nodes — avoid querySelector every zoom frame. */
const panelCache = new Map<string, HTMLElement>()
const nodeCache = new Map<string, HTMLElement>()

const FULL_OP: OverlapFadeOp = { fill: 1, chrome: 1 }

function notify(): void {
  listeners.forEach((fn) => fn())
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
    nodeEl.removeAttribute('data-tt-overlap-fade')
    nodeEl.classList.remove('tt-overlap-fade-pass')
  }
  panelCache.delete(id)
  nodeCache.delete(id)
}

/**
 * Drive fade via CSS vars on the RF node, not inline opacity —
 * selected-frame React reconciles wipe inline styles on fill/chrome every tick.
 * `--tt-overlap-fade` → fill; `--tt-overlap-chrome` → adjust box. Click-through
 * only while the fill is faded (under-mate keeps content hittable).
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
    const active = fill < 0.999 || chrome < 0.999
    const passThrough = fill < CLICK_THROUGH_OPACITY // Fill fade only — not chrome-only under-mate
    if (!active) {
      nodeEl.style.removeProperty('--tt-overlap-fade')
      nodeEl.style.removeProperty('--tt-overlap-chrome')
      nodeEl.removeAttribute('data-tt-overlap-fade')
      nodeEl.style.removeProperty('pointer-events')
      nodeEl.classList.remove('tt-overlap-fade-pass')
      continue
    }
    nodeEl.style.setProperty('--tt-overlap-fade', String(fill))
    nodeEl.style.setProperty('--tt-overlap-chrome', String(chrome))
    nodeEl.setAttribute('data-tt-overlap-fade', '')
    if (passThrough) {
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
  // Always paint — even when values are unchanged, drag may have remounted the node DOM
  paintOpacitiesOnDom(next)
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
  if (opacityById.size === 0) return
  opacityById = new Map()
  hideEpoch += 1
  notify()
}

/** True when this frame must not receive select / drag (clicks pass through). */
export function isLargeOverlapClickThrough(id: string | undefined | null): boolean {
  return getLargeOverlapFillOpacity(id) < CLICK_THROUGH_OPACITY
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
