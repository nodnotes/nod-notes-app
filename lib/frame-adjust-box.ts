// Upright adjust-box geometry for snap / stack (blue selection chrome).
// Snap + stack lines live in the gap between adjust boxes, not the inner fill.

import type { Node } from 'reactflow'
import { absFlowPosition, nodeFlowSize } from '@/components/use-block-group-drag'
import {
  fillOriginFromFlowPosition,
  readFrameChromePad,
} from '@/lib/frame-chrome-offset' // Upright RF XY is fill; rotated selected uses pad
import {
  FRAME_CHROME_ZOOM_FLOOR,
  frameScreenChromeScale,
} from '@/components/threads/constants' // Wrap/+ / adjust chrome ui

/** TipTap ⋮⋮ layout width — gutter column tracks this × grip chrome × frameScale. */
export const GRIP_COL_W = 14
/** Hug / min-width fallback for the ⋮⋮ column (slightly above grip). */
export const BLOCK_HANDLE_GUTTER_W = 20
/** Air each side of the ⋮⋮ inside the blue↔fill strip (board px at frameScale 1). */
export const GRIP_SIDE_PAD_SCREEN = 1
/** Extra blue↔fill air, split evenly so the ⋮⋮ stays on the strip midpoint. */
export const ADJUST_CONTENT_GAP_X = 0 // Grip column already has side pads — no extra blue↔fill X
export const ADJUST_CONTENT_GAP_Y = 2 // T/B band air when no property / connections strip
export const CONNECTIONS_ROW_PAD = 4 // Air above and below the 14px connections mark
export const CONNECTIONS_GROUP_H = 14 + CONNECTIONS_ROW_PAD * 2 // One chrome row — top gap copies this when connections show
/** `+# rows — show more / show less` under a Notion DB table (py-1 + 11px). */
export const DB_ROWS_REVEAL_FOOTER_H = 24

/**
 * Child `transform: scale` for wrap bars / fit +'s (and add-line hit geometry).
 * No 1.4× chrome boost (that oversized wrap/+). Big `frameScale` → milder √ counter.
 * Zooms out with the board (dash width tracks dash height); ≥100% stays screen-constant.
 */
export function blockGripChromeScale(zoom: number, frameScale: number): number {
  const fs = Math.max(0.15, frameScale)
  const contentPart = 1 / Math.max(1, Math.sqrt(fs)) // Mild counter when text is large
  const z = Math.max(0.01, zoom) // Guard against 0 / negative store values
  // <100%: ride so wrap dashes stay proportional. ≥100%: 1/zoom (same family as ⋮⋮).
  return Math.min(1, 1 / z) * contentPart
}

/** Extra paint size for ⋮⋮ vs bare √ content (still rides the board with text below 100%). */
export const BLOCK_HANDLE_CHROME_BOOST = 2

/**
 * TipTap ⋮⋮ — rides the board below 100% zoom; screen-constant at ≥100%.
 * Shrunk content: ride 1:1 (no boost — boost stayed huge vs tiny text).
 * Grown content: boost × √ comfort.
 * Zoomed in: ×1/zoom so screen size matches 100% (view-relative).
 */
export function blockHandleChromeScale(zoom: number, frameScale: number): number {
  const fs = Math.max(0.15, frameScale)
  // Content curve only — zoom compensation applied below
  const content = fs < 1 ? 1 : BLOCK_HANDLE_CHROME_BOOST / Math.sqrt(fs)
  const z = Math.max(0.01, zoom) // Guard against 0 / negative store values
  // <100%: ride the board. ≥100%: shrink in flow so painted size stays at the 100% screen size.
  const zoomPart = Math.min(1, 1 / z)
  return content * zoomPart
}

/** Flow px for a small screen-constant pad (resize/connection chrome — not ⋮⋮ gutters). */
export function screenPadFlow(zoom: number, screenPx: number): number {
  return screenPx / Math.max(0.01, zoom)
}

/**
 * Grip / gutter air in flow — same ui × √frameScale curve as the ⋮⋮ itself.
 */
export function gripComfortFlow(zoom: number, frameScale: number, nominalPx: number): number {
  const fs = Math.max(0.15, frameScale)
  return nominalPx * blockGripChromeScale(zoom, fs) * fs
}

/**
 * How much the blue↔fill strip grows with content scale.
 * Linear × frameScale ballooned place-scale frames; √ keeps growth with content milder.
 */
export function adjustChromePadScale(frameScale = 1): number {
  const fs = Math.max(0.15, frameScale)
  return fs <= 1 ? fs : Math.sqrt(fs) // Below 1: ride shrink; above 1: ~√ growth
}

/**
 * Flow multiplier so blue↔fill gutters track adjust-frame chrome on zoom.
 * Same boost + floor as resize dots — gap stays screen-constant with the handles.
 */
export function adjustChromeZoomScale(zoom: number): number {
  return frameScreenChromeScale(zoom) // Identical to --tt-frame-ui-scale
}

/**
 * Flow width of the ⋮⋮ column = painted grip + side pads (grip↔fill and grip↔outer).
 * Below 100%: content-sized (rides the board). At ≥100%: ×1/zoom so the strip
 * fits the screen-constant ⋮⋮ (same curve as `blockHandleChromeScale`).
 */
export function handleGutterFlowPx(zoom: number, frameScale = 1): number {
  // Boost only when content is ≥1 — shrunk frames keep a tight strip for the smaller ⋮⋮
  const boost = frameScale < 1 ? 1 : BLOCK_HANDLE_CHROME_BOOST
  const fs = adjustChromePadScale(frameScale) * boost
  const contentCol = GRIP_COL_W * fs + 2 * GRIP_SIDE_PAD_SCREEN * fs // Strip below 100%
  const z = Math.max(0.01, zoom)
  // Match ⋮⋮: ride when zoomed out; screen-constant when zoomed in
  return contentCol * Math.min(1, 1 / z)
}

/** Blue↔gutter air in board px — usually 0; grip pads own the L/R strip. */
export function adjustGapFlowPx(zoom: number, frameScale = 1): number {
  return ADJUST_CONTENT_GAP_X * adjustChromePadScale(frameScale) * adjustChromeZoomScale(zoom)
}

/** Blue↔fill air on T/B when the property / connections strip is absent. */
export function adjustGapYFlow(zoom: number, frameScale = 1): number {
  return ADJUST_CONTENT_GAP_Y * adjustChromePadScale(frameScale) * adjustChromeZoomScale(zoom)
}

/**
 * Split a painted strip into the first row (used to center the fill) and wrapped rows.
 * A missing strip is `{0,0}` — no row is reserved on that side.
 */
export function splitChromeStrip(painted: number, rowH: number): { slot: number; extra: number } {
  if (painted <= 0) return { slot: 0, extra: 0 } // No icons — do not reserve a row
  const unit = Math.max(1, rowH) // One-row height; guard a zero scale
  const rows = Math.max(1, Math.round(painted / unit)) // A slightly tall row still counts as one
  if (rows <= 1) return { slot: painted, extra: 0 } // Single row — its full height can be mirrored
  return { slot: unit, extra: painted - unit } // Second+ rows stay on this side only
}

/**
 * Selected upright pads between the fill and the adjust box.
 * Neither strip → equal blue↔fill air (no empty row).
 * One strip → the empty side matches that one row so the fill stays centered.
 * Wrapped rows and the DB footer grow only their own side.
 */
export function selectedAdjustChromeY(opts: {
  gapY: number // Air when both strips are absent
  rowH: number // One property / connections row
  propH: number // 0, or painted property-strip height
  connH: number // 0, or painted connections-strip height
  footerH: number // DB `+# rows` — real bottom chrome, not a mirrored row
  dbTopBand: boolean // DB frames keep a top band so the blue edge is not flush
}): { yTop: number; yBottom: number } {
  const top = splitChromeStrip(opts.propH, opts.rowH) // Property first row + wrap
  const bottom = splitChromeStrip(opts.connH, opts.rowH) // Connections first row + wrap
  const shared = Math.max(top.slot, bottom.slot) // Empty side copies the other side's one row
  const footer = Math.max(0, opts.footerH) // Footer lives in the bottom pad only
  if (shared === 0 && footer === 0) {
    // No rows present — air only, same on both sides
    const yTop = opts.dbTopBand ? Math.max(opts.gapY, opts.rowH) : opts.gapY // DB top stays a full band
    return { yTop, yBottom: opts.gapY } // Bottom air matches; no connections row reserved
  }
  let yTop = shared + top.extra // Centered one-row gap, plus wrapped property rows
  let yBottom = shared + bottom.extra + footer // Centered one-row gap, plus wrap + footer
  if (opts.dbTopBand && opts.propH <= 0) yTop = Math.max(yTop, opts.rowH) // DB without properties stays open on top
  return { yTop, yBottom } // Pads the blue box uses above / below the fill
}

/** Full L/R pad. ⋮⋮ is centered in this strip — tracks content scale + chrome zoom. */
export function adjustChromeXFlow(zoom: number, frameScale = 1): number {
  return handleGutterFlowPx(zoom, frameScale) + adjustGapFlowPx(zoom, frameScale)
}

export type FlowBox = { x: number; y: number; width: number; height: number }
export type AdjustChromeInsets = { x: number; yTop: number; yBottom: number }

function nodeMeta(n: Node): Record<string, unknown> {
  return (n.data?.promptMessage?.metadata || {}) as Record<string, unknown>
}

/** TipTap HTML on the frame — used to reserve DB footer air in the adjust box. */
function nodeContent(n: Node): string {
  const raw = n.data?.promptMessage?.content
  return typeof raw === 'string' ? raw : ''
}

/** True when this frame embeds a Notion databaseBlock table. */
function nodeHasDatabaseBlock(n: Node): boolean {
  return /data-type=["']databaseBlock["']/i.test(nodeContent(n))
}

function metaFrameScale(meta: Record<string, unknown>): number {
  const fs = meta.frameScale
  return typeof fs === 'number' && Number.isFinite(fs) ? Math.max(0.15, fs) : 1
}

/** Nominal adjust-box chrome (flow px) — gutter + bands track frameScale like the selected paint. */
export function nominalAdjustChromeInsets(
  meta: Record<string, unknown>,
  zoom: number,
  isDatabase = false // Notion DB frames reserve footer air under the fill
): AdjustChromeInsets {
  const fs = metaFrameScale(meta)
  const ui = adjustChromeZoomScale(zoom) // Same live chrome scale as the painted blue box
  const x = Math.round(adjustChromeXFlow(zoom, fs)) // Same content + zoom strip as ChatPanelNode
  const band = Math.round(CONNECTIONS_GROUP_H * fs * ui) // T/B row tracks chrome zoom
  const gapY = Math.round(adjustGapYFlow(zoom, fs)) // T/B air tracks content + chrome zoom
  const footer = isDatabase ? Math.round(DB_ROWS_REVEAL_FOOTER_H * fs * ui) : 0
  // Same pads as the painted blue box (selectedAdjustChromeY). Snap is adjust-box to adjust-box.
  const pads = selectedAdjustChromeY({
    gapY, // Air when there is no property / connections row
    rowH: band, // One connections row
    propH: 0, // Property icons live in the fill, not a top strip
    connH: meta.notionConnected === true ? band : 0, // Notion mark sits in the bottom band
    footerH: footer, // DB `+# rows` grows the bottom only
    dbTopBand: isDatabase, // DB top stays a full band so the blue edge is not flush
  })
  return { x, yTop: pads.yTop, yBottom: pads.yBottom }
}

/** True when RF XY is the fill origin (chrome grows via negative margins, not frameChromePad). */
function nodeIsUpright(node: Node): boolean {
  const rot = nodeMeta(node).rotation
  return typeof rot !== 'number' || Math.abs(rot) <= 0.5
}

/** Painted select chrome from the panel — present only once gutters/bands are mounted. */
function readDomChromePads(nodeId: string): AdjustChromeInsets | null {
  if (typeof document === 'undefined') return null
  const panel = document.querySelector(
    `.react-flow__node[data-id="${CSS.escape(nodeId)}"] [data-panel-container="true"]`
  ) as HTMLElement | null
  if (!panel) return null
  const x = parseFloat(panel.getAttribute('data-tt-chrome-pad-x') || '') || 0
  const yTop = parseFloat(panel.getAttribute('data-tt-chrome-pad-y-top') || '') || 0
  const yBottom = parseFloat(panel.getAttribute('data-tt-chrome-pad-y-bottom') || '') || 0
  if (x <= 0 && yTop <= 0 && yBottom <= 0) return null // Attrs absent — RF size is still fill-only
  return { x, yTop, yBottom }
}

/** Fill size from the painted panel (border-box minus pads) — correct even while RF width lags. */
function readDomFillSize(nodeId: string): { width: number; height: number } | null {
  if (typeof document === 'undefined') return null
  const panel = document.querySelector(
    `.react-flow__node[data-id="${CSS.escape(nodeId)}"] [data-panel-container="true"]`
  ) as HTMLElement | null
  if (!panel) return null
  const pads = readDomChromePads(nodeId)
  if (!pads) return null
  const w = panel.offsetWidth - pads.x * 2
  const h = panel.offsetHeight - pads.yTop - pads.yBottom
  if (w < 1 || h < 1) return null
  return { width: w, height: h }
}

/** Saved fill size on the frame — used when selected RF size already includes chrome. */
function metaFillSize(meta: Record<string, unknown>): { width: number; height: number } | null {
  const dims = meta.resizeDimensions as { width?: unknown; height?: unknown } | undefined
  if (!dims || typeof dims.width !== 'number' || typeof dims.height !== 'number') return null
  if (dims.width < 1 || dims.height < 1) return null
  return { width: dims.width, height: dims.height }
}

/**
 * Always expand from the fill so select/deselect cannot move the blue box.
 * Fill source must not branch on `selected` — that swapped RF size vs saved/dom and
 * moved the stack square even when the frames stayed put.
 */
function adjustBoxFromRfAbs(
  node: Node,
  abs: { x: number; y: number },
  size: { width: number; height: number },
  zoom: number
): FlowBox {
  if (node.selected && !nodeIsUpright(node)) {
    return { x: abs.x, y: abs.y, width: size.width, height: size.height } // Rotated AABB origin
  }
  const meta = nodeMeta(node)
  const chrome = nominalAdjustChromeInsets(meta, zoom, nodeHasDatabaseBlock(node))
  const fillOrigin = fillOriginFromFlowPosition(abs, readFrameChromePad(node.data))
  const saved = metaFillSize(meta)
  const domFill = readDomFillSize(node.id) // Only when chrome pads are painted
  // Same order selected or not: saved fill → painted fill → RF size (fill when unselected / select race)
  const fillW = saved?.width ?? domFill?.width ?? size.width
  const fillH = saved?.height ?? domFill?.height ?? size.height
  return {
    x: fillOrigin.x - chrome.x,
    y: fillOrigin.y - chrome.yTop,
    width: fillW + chrome.x * 2,
    height: fillH + chrome.yTop + chrome.yBottom,
  }
}

/** Adjust-box width/height in flow px — same fill→chrome expand as `frameAdjustFlowBox`. */
export function frameAdjustFlowSize(
  node: Node,
  zoom: number
): { width: number; height: number } {
  const box = adjustBoxFromRfAbs(node, { x: 0, y: 0 }, nodeFlowSize(node), zoom)
  return { width: box.width, height: box.height }
}

/** Upright adjust-box in absolute flow space — stable across select/deselect. */
export function frameAdjustFlowBox(node: Node, live: Node[], zoom: number): FlowBox {
  return adjustBoxFromRfAbs(node, absFlowPosition(node, live), nodeFlowSize(node), zoom)
}

/** RF absolute top-left from an adjust-box top-left. */
export function rfAbsFromAdjustOrigin(
  adjustOrigin: { x: number; y: number },
  node: Node,
  zoom: number
): { x: number; y: number } {
  if (node.selected && !nodeIsUpright(node)) return adjustOrigin // Rotated: RF is adjust AABB
  const chrome = nominalAdjustChromeInsets(nodeMeta(node), zoom, nodeHasDatabaseBlock(node))
  return { x: adjustOrigin.x + chrome.x, y: adjustOrigin.y + chrome.yTop } // Fill origin
}

/** Adjust box when the frame already sits at absolute flow `abs`. */
export function frameAdjustFlowBoxAt(
  node: Node,
  abs: { x: number; y: number },
  zoom: number
): FlowBox {
  return adjustBoxFromRfAbs(node, abs, nodeFlowSize(node), zoom)
}

/** Screen rect of the upright adjust box (stack line portal). */
export function frameAdjustScreenRect(
  nodeId: string,
  node: Node | undefined,
  zoom: number
): DOMRect | null {
  const el = document.querySelector(
    `.react-flow__node[data-id="${CSS.escape(nodeId)}"]`
  ) as HTMLElement | null
  if (!el) return null
  if (node?.selected && nodeIsUpright(node)) {
    // Panel negative margins hang past the RF wrapper — use the painted blue box
    const panel = el.querySelector('[data-panel-container="true"]') as HTMLElement | null
    if (panel) return panel.getBoundingClientRect()
  }
  const rect = el.getBoundingClientRect()
  if (!node || node.selected) return rect // Rotated selected: wrapper is the AABB
  const chrome = nominalAdjustChromeInsets(nodeMeta(node), zoom, nodeHasDatabaseBlock(node))
  const expandX = chrome.x * zoom
  const expandYTop = chrome.yTop * zoom
  const expandYBottom = chrome.yBottom * zoom
  return new DOMRect(
    rect.left - expandX,
    rect.top - expandYTop,
    rect.width + 2 * expandX,
    rect.height + expandYTop + expandYBottom
  )
}
