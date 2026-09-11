// Upright adjust-box geometry for snap / stack (blue selection chrome).
// Snap + stack lines live in the gap between adjust boxes, not the inner fill.

import type { Node } from 'reactflow'
import { absFlowPosition, nodeFlowSize } from '@/components/use-block-group-drag'

/** TipTap ⋮⋮ layout width — gutter column tracks this × grip chrome × frameScale. */
export const GRIP_COL_W = 14
/** Hug / min-width fallback for the ⋮⋮ column (slightly above grip). */
export const BLOCK_HANDLE_GUTTER_W = 20
/** Screen px of air on each side of the ⋮⋮ (grip↔fill and grip↔blue-side air). */
export const GRIP_SIDE_PAD_SCREEN = 3
/** Screen px between blue adjust edge and the ⋮⋮ column. */
export const ADJUST_CONTENT_GAP_X = 3
export const ADJUST_CONTENT_GAP_Y = 6 // T/B band air
export const CONNECTIONS_GROUP_H = 28 // Connections strip height

/**
 * Child `transform: scale` for TipTap ⋮⋮ / add lines (same curve as `tiptap-block-handles`).
 * Zoomed/scaled out → 1 (rides). Zoomed/scaled in → 1/√eff (grows ~√ with big text).
 */
export function blockGripChromeScale(zoom: number, frameScale: number): number {
  const effective = Math.max(0.01, zoom) * Math.max(0.15, frameScale)
  return 1 / Math.max(1, Math.sqrt(effective))
}

/** Flow px for a small screen-constant pad (stays visible when zoomed out). */
export function screenPadFlow(zoom: number, screenPx: number): number {
  return screenPx / Math.max(0.01, zoom)
}

/**
 * Flow width of the ⋮⋮ column = painted grip + side pads (grip↔fill and grip↔outer).
 * Side pads are screen-constant so they don’t vanish at 40% zoom.
 */
export function handleGutterFlowPx(zoom: number, frameScale = 1): number {
  const fs = Math.max(0.15, frameScale)
  const gripFlow = GRIP_COL_W * blockGripChromeScale(zoom, fs) * fs
  return gripFlow + 2 * screenPadFlow(zoom, GRIP_SIDE_PAD_SCREEN)
}

/** Blue↔gutter air — screen-constant small gap. */
export function adjustGapFlowPx(zoom: number): number {
  return screenPadFlow(zoom, ADJUST_CONTENT_GAP_X)
}

/** Full L/R pad: [blue][air][pad][grip][pad][fill] — small gaps on both sides of the handle. */
export function adjustChromeXFlow(zoom: number, frameScale = 1): number {
  return handleGutterFlowPx(zoom, frameScale) + adjustGapFlowPx(zoom)
}

export type FlowBox = { x: number; y: number; width: number; height: number }
export type AdjustChromeInsets = { x: number; yTop: number; yBottom: number }

function nodeMeta(n: Node): Record<string, unknown> {
  return (n.data?.promptMessage?.metadata || {}) as Record<string, unknown>
}

function metaFrameScale(meta: Record<string, unknown>): number {
  const fs = meta.frameScale
  return typeof fs === 'number' && Number.isFinite(fs) ? Math.max(0.15, fs) : 1
}

/** Nominal adjust-box chrome (flow px) — gutter tracks grip size at this zoom/frameScale. */
export function nominalAdjustChromeInsets(
  meta: Record<string, unknown>,
  zoom: number
): AdjustChromeInsets {
  const x = Math.round(adjustChromeXFlow(zoom, metaFrameScale(meta)))
  // Property + connections strips live inside the fill, so the blue box only insets L/R.
  return { x, yTop: 0, yBottom: 0 }
}

/** Adjust-box width/height in flow px (selected RF outer box already includes chrome). */
export function frameAdjustFlowSize(
  node: Node,
  zoom: number
): { width: number; height: number } {
  const size = nodeFlowSize(node)
  if (node.selected) return size
  const chrome = nominalAdjustChromeInsets(nodeMeta(node), zoom)
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
  const chrome = nominalAdjustChromeInsets(nodeMeta(node), zoom)
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
  const chrome = nominalAdjustChromeInsets(nodeMeta(node), zoom)
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
  const chrome = nominalAdjustChromeInsets(nodeMeta(node), zoom)
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
  const chrome = nominalAdjustChromeInsets(nodeMeta(node), zoom)
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
