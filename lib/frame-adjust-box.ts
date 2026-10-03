// Upright adjust-box geometry for snap / stack (blue selection chrome).
// Snap + stack lines live in the gap between adjust boxes, not the inner fill.

import type { Node } from 'reactflow'
import { absFlowPosition, nodeFlowSize } from '@/components/use-block-group-drag'

/** TipTap ⋮⋮ layout width — gutter column tracks this × grip chrome × frameScale. */
export const GRIP_COL_W = 14
/** Hug / min-width fallback for the ⋮⋮ column (slightly above grip). */
export const BLOCK_HANDLE_GUTTER_W = 20
/** Nominal air on each side of the ⋮⋮ at 100% zoom (grip↔fill and grip↔blue-side). */
export const GRIP_SIDE_PAD_SCREEN = 3
/** Nominal blue↔gutter air at 100% zoom. */
export const ADJUST_CONTENT_GAP_X = 3
export const ADJUST_CONTENT_GAP_Y = 6 // T/B band air when no property / connections strip
export const CONNECTIONS_GROUP_H = 18 // One chrome row: 14px glyph (frame text) + 2px air each side
/** `+# rows — show more / show less` under a Notion DB table (py-1 + 11px). */
export const DB_ROWS_REVEAL_FOOTER_H = 24

/**
 * Child `transform: scale` for TipTap ⋮⋮ / add lines (same curve as `tiptap-block-handles`).
 * Zoomed/scaled out → 1 (rides). Zoomed/scaled in → 1/√eff (grows ~√ with big text).
 */
export function blockGripChromeScale(zoom: number, frameScale: number): number {
  const effective = Math.max(0.01, zoom) * Math.max(0.15, frameScale)
  return 1 / Math.max(1, Math.sqrt(effective))
}

/** Flow px for a small screen-constant pad (resize/connection chrome — not ⋮⋮ gutters). */
export function screenPadFlow(zoom: number, screenPx: number): number {
  return screenPx / Math.max(0.01, zoom)
}

/**
 * Grip / gutter air in flow — same √×frameScale curve as the ⋮⋮ itself.
 * Screen-constant ÷zoom pads ballooned around a riding grip when zoomed out.
 */
export function gripComfortFlow(zoom: number, frameScale: number, nominalPx: number): number {
  const fs = Math.max(0.15, frameScale)
  return nominalPx * blockGripChromeScale(zoom, fs) * fs
}

/**
 * Flow width of the ⋮⋮ column = painted grip + side pads (grip↔fill and grip↔outer).
 * Pads track grip chrome so zoomed-out gutters don’t look oversized.
 */
export function handleGutterFlowPx(zoom: number, frameScale = 1): number {
  const fs = Math.max(0.15, frameScale)
  const chrome = blockGripChromeScale(zoom, fs)
  const gripFlow = GRIP_COL_W * chrome * fs
  return gripFlow + 2 * GRIP_SIDE_PAD_SCREEN * chrome * fs
}

/** Blue↔gutter air — same comfort curve as the ⋮⋮ column. */
export function adjustGapFlowPx(zoom: number, frameScale = 1): number {
  return gripComfortFlow(zoom, frameScale, ADJUST_CONTENT_GAP_X)
}

/** Blue↔fill air on T/B when the property / connections strip is absent. */
export function adjustGapYFlow(zoom: number, frameScale = 1): number {
  return gripComfortFlow(zoom, frameScale, ADJUST_CONTENT_GAP_Y)
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

/** Full L/R pad: [blue][air][pad][grip][pad][fill] — small gaps on both sides of the handle. */
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

/** Nominal adjust-box chrome (flow px) — gutter tracks grip size at this zoom/frameScale. */
export function nominalAdjustChromeInsets(
  meta: Record<string, unknown>,
  zoom: number,
  isDatabase = false // Notion DB frames reserve footer air under the fill
): AdjustChromeInsets {
  const fs = metaFrameScale(meta)
  const x = Math.round(adjustChromeXFlow(zoom, fs))
  const band = Math.round(CONNECTIONS_GROUP_H * fs)
  const gapY = Math.round(adjustGapYFlow(zoom, fs)) // Blue↔fill air when no strip
  const footer = isDatabase ? Math.round(DB_ROWS_REVEAL_FOOTER_H * fs) : 0
  // No property row above the fill. DB frames still keep a top band so the blue edge isn't flush.
  const yTop = isDatabase ? Math.max(gapY, band) : 0
  // Bottom adjust band (footer + connections) — snap/stack must clear it
  const yBottom = (meta.notionConnected === true ? band : 0) + footer
  return { x, yTop, yBottom }
}

/** Adjust-box width/height in flow px (selected RF outer box already includes chrome). */
export function frameAdjustFlowSize(
  node: Node,
  zoom: number
): { width: number; height: number } {
  const size = nodeFlowSize(node)
  if (node.selected) return size
  const chrome = nominalAdjustChromeInsets(nodeMeta(node), zoom, nodeHasDatabaseBlock(node))
  return {
    width: size.width + chrome.x * 2,
    height: size.height + chrome.yTop + chrome.yBottom,
  }
}

/** Upright adjust-box in absolute flow space. */
export function frameAdjustFlowBox(node: Node, live: Node[], zoom: number): FlowBox {
  const abs = absFlowPosition(node, live)
  const size = nodeFlowSize(node)
  if (node.selected) {
    return { x: abs.x, y: abs.y, width: size.width, height: size.height }
  }
  const chrome = nominalAdjustChromeInsets(nodeMeta(node), zoom, nodeHasDatabaseBlock(node))
  return {
    x: abs.x - chrome.x,
    y: abs.y - chrome.yTop,
    width: size.width + chrome.x * 2,
    height: size.height + chrome.yTop + chrome.yBottom,
  }
}

/** RF absolute top-left from an adjust-box top-left. */
export function rfAbsFromAdjustOrigin(
  adjustOrigin: { x: number; y: number },
  node: Node,
  zoom: number
): { x: number; y: number } {
  if (node.selected) return adjustOrigin
  const chrome = nominalAdjustChromeInsets(nodeMeta(node), zoom, nodeHasDatabaseBlock(node))
  return { x: adjustOrigin.x + chrome.x, y: adjustOrigin.y + chrome.yTop }
}

/** Adjust box when the frame already sits at absolute flow `abs`. */
export function frameAdjustFlowBoxAt(
  node: Node,
  abs: { x: number; y: number },
  zoom: number
): FlowBox {
  const size = nodeFlowSize(node)
  if (node.selected) {
    return { x: abs.x, y: abs.y, width: size.width, height: size.height }
  }
  const chrome = nominalAdjustChromeInsets(nodeMeta(node), zoom, nodeHasDatabaseBlock(node))
  return {
    x: abs.x - chrome.x,
    y: abs.y - chrome.yTop,
    width: size.width + chrome.x * 2,
    height: size.height + chrome.yTop + chrome.yBottom,
  }
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
  const rect = el.getBoundingClientRect()
  if (!node || node.selected) return rect
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
