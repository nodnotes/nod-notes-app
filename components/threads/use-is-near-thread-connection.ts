'use client'

import { useEffect } from 'react' // Track the real pointer while a thread end is dragged
import { useStore, useStoreApi } from 'reactflow' // Live connection drag position + node boxes
import {
  adjustChromeXFlow, // L/R adjust-box gutter in flow px
  adjustGapYFlow, // Blue↔fill air on T/B
  CONNECTIONS_GROUP_H, // Property / connections strip
  DB_ROWS_REVEAL_FOOTER_H, // Notion DB footer inside the bottom band
  selectedAdjustChromeY, // One-row balance so a lone strip does not shove the fill
} from '@/lib/frame-adjust-box'
import { FRAME_SCREEN_CHROME_BOOST } from './constants' // Screen-constant chrome boost
import { INDICATOR_OUTSET, normalizeHandleId } from './handle-ids' // Dot outset; `right-indicator` → `right`

/** Bit per side so the store selector can return a stable number. */
export const THREAD_SIDE_BIT = {
  left: 1, // Left connection point
  right: 2, // Right connection point
  top: 4, // Top connection point
  bottom: 8, // Bottom connection point
} as const

export type ThreadSide = keyof typeof THREAD_SIDE_BIT // left | right | top | bottom

/** All four simulated connection points — pointer is on the adjust box, not the fill. */
export const THREAD_ALL_SIDES =
  THREAD_SIDE_BIT.left | THREAD_SIDE_BIT.right | THREAD_SIDE_BIT.top | THREAD_SIDE_BIT.bottom

/** Pointer is on the frame fill — show the connection box, not the dots. */
export const THREAD_CONNECTION_BOX = 16

type Box = { left: number; top: number; right: number; bottom: number } // Pane-local rectangle

/** Bit for a snapped handle id, or 0 when it is not a side. */
function bitForHandle(handleId: string | null | undefined): number {
  const side = normalizeHandleId(handleId) // Drop the indicator suffix
  if (side === 'left' || side === 'right' || side === 'top' || side === 'bottom') {
    return THREAD_SIDE_BIT[side] // Only the side already snapped
  }
  return 0 // Unknown handle — show nothing
}

/** True when the pointer is inside the rectangle (edges included). */
function contains(box: Box, x: number, y: number): boolean {
  return x >= box.left && x <= box.right && y >= box.top && y <= box.bottom
}

type Chrome = { x: number; yTop: number; yBottom: number } // Flow px outset from the fill to the adjust box

/** Adjust-box padding around a frame fill — same bands as selected chrome. */
function frameChromeInsets(
  meta: Record<string, unknown>,
  content: string,
  zoom: number
): Chrome {
  const fsRaw = meta.frameScale // Locked place-scale
  const fs = typeof fsRaw === 'number' && Number.isFinite(fsRaw) ? Math.max(0.15, fsRaw) : 1
  const x = Math.round(adjustChromeXFlow(zoom, fs)) // L/R gutter
  const gapY = Math.round(adjustGapYFlow(zoom, fs)) // Blue↔fill air
  const band = Math.round(CONNECTIONS_GROUP_H * fs) // Full strip height
  const isDb = /data-type=["']databaseBlock["']/i.test(content) // Notion table frame
  const footer = isDb ? Math.round(DB_ROWS_REVEAL_FOOTER_H * fs) : 0 // `+# rows` under the table
  const conn = meta.notionConnected === true ? band : 0 // Bottom connections strip (one row — wrap is live in the panel)
  const pads = selectedAdjustChromeY({
    gapY, // Air when both strips are absent
    rowH: band, // One row
    propH: 0, // Properties are blocks in the frame — top gap only mirrors a connection below
    connH: conn, // No connections row → nothing reserved on the bottom
    footerH: footer, // DB footer stays on the bottom
    dbTopBand: isDb, // DB top band when there are no property icons
  })
  return { x, yTop: pads.yTop, yBottom: pads.yBottom }
}

type InternalsNode = {
  type?: string
  hidden?: boolean
  width?: number | null
  height?: number | null
  positionAbsolute?: { x: number; y: number } | null
  position: { x: number; y: number }
  data?: {
    promptMessage?: { content?: unknown; metadata?: Record<string, unknown> }
  }
}

type ConnState = {
  connectionNodeId: string | null // Frame the drag started on
  connectionEndHandle: { nodeId: string; handleId: string | null } | null // Snap target, if any
  connectionPosition: { x: number; y: number } // Snapped thread end (pane px) — not the pointer
  threadDragPointer?: { x: number; y: number } | null // Real pointer; snap must not fake a frame hover
  transform: [number, number, number] // RF viewport
  nodeInternals: Map<string, InternalsNode>
}

/**
 * While a thread end is dragged:
 * • frame fill → connection box and all simulated connection points
 * • adjust box (outside the fill) → all simulated connection points
 * Drawings and shapes use a screen-constant band in place of frame chrome.
 */
export function nearThreadConnectionSides(s: ConnState, nodeId: string | undefined): number {
  if (!nodeId || !s.connectionNodeId) return 0 // Idle — no thread drag
  if (s.connectionNodeId === nodeId) return 0 // Never highlight the drag's source frame

  const node = s.nodeInternals.get(nodeId) // This object's measured box
  if (!node || node.hidden) return 0 // Hidden objects stay quiet

  const w = node.width ?? 0 // Flow width (fill while a thread is dragging)
  const h = node.height ?? 0 // Flow height
  if (w <= 0 || h <= 0) return 0 // Not measured yet

  const abs = node.positionAbsolute ?? node.position // Flow-space top-left
  const [tx, ty, zoom] = s.transform // Pane transform
  const z = zoom || 1 // Avoid a zero scale
  const fill: Box = {
    left: abs.x * z + tx, // Pane-local left of the frame area
    top: abs.y * z + ty, // Pane-local top
    right: (abs.x + w) * z + tx, // Pane-local right
    bottom: (abs.y + h) * z + ty, // Pane-local bottom
  }
  const meta = node.data?.promptMessage?.metadata ?? {} // Frame chrome inputs
  const content = typeof node.data?.promptMessage?.content === 'string' ? node.data.promptMessage.content : ''
  const chrome =
    node.type === 'chatPanel'
      ? frameChromeInsets(meta, content, z) // Real adjust-box bands
      : null
  const band = INDICATOR_OUTSET * FRAME_SCREEN_CHROME_BOOST // Screen px around drawings / shapes
  const adjust: Box = chrome
    ? {
        left: fill.left - chrome.x * z, // Adjust box left
        top: fill.top - chrome.yTop * z, // Adjust box top
        right: fill.right + chrome.x * z, // Adjust box right
        bottom: fill.bottom + chrome.yBottom * z, // Adjust box bottom
      }
    : {
        left: fill.left - band, // Dot ring around a drawing / shape
        top: fill.top - band,
        right: fill.right + band,
        bottom: fill.bottom + band,
      }
  const { x: cx, y: cy } = s.threadDragPointer ?? s.connectionPosition // Real pointer, not the snapped end
  if (contains(fill, cx, cy)) return THREAD_CONNECTION_BOX | THREAD_ALL_SIDES // Frame area → box and every simulated point
  if (contains(adjust, cx, cy)) return THREAD_ALL_SIDES // Adjust box → every simulated point
  if (s.connectionEndHandle?.nodeId === nodeId) return bitForHandle(s.connectionEndHandle.handleId) // Snapped just outside
  return 0
}

/** Bitmask: side bits, all sides, or the connection-box flag during a thread drag. */
export function useNearThreadConnectionSides(nodeId: string | undefined): number {
  return useStore((s) => nearThreadConnectionSides(s, nodeId)) // Re-render only when the mask changes
}

/** True when this frame should show connection chrome during a thread drag. */
export function useIsNearThreadConnection(nodeId: string | undefined): boolean {
  return useNearThreadConnectionSides(nodeId) !== 0 // Dots or the connection box
}

/** Keep the real pointer on the store so a snapped thread end cannot leave the blue box up. */
export function useTrackThreadDragPointer(active: boolean) {
  const store = useStoreApi() // Same store the zone test reads
  useEffect(() => {
    if (!active) {
      store.setState({ threadDragPointer: null }) // Drag ended — drop the pointer
      return
    }
    const onMove = (event: PointerEvent) => {
      const bounds = store.getState().domNode?.getBoundingClientRect() // Pane origin
      if (!bounds) return
      store.setState({
        threadDragPointer: {
          x: event.clientX - bounds.left, // Pane-local pointer, before snap
          y: event.clientY - bounds.top,
        },
      })
    }
    document.addEventListener('pointermove', onMove, true) // Before RF writes the snapped end
    return () => {
      document.removeEventListener('pointermove', onMove, true)
      store.setState({ threadDragPointer: null })
    }
  }, [active, store])
}
