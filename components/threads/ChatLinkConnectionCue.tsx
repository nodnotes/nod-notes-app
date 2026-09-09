// Chat-linked connection cue: keep the normal blue simulator on the connection
// point, and place the brand T (hand-drawn arm from Nod notes icon 3) to the left
// of the dot. Disc sits at the table-blob height on the T (not top-aligned).
// Click opens chat with the linked turn selected; drag still starts a board thread.

import type { CSSProperties } from 'react'
import { ConnectionIndicator } from '@/components/threads/ConnectionIndicator'
import {
  NN_BLOB_CY_FRAC,
  NN_CONNECTION_T_PATH,
  NN_CONNECTION_T_VIEWBOX,
} from '@/components/nod-notes-icon' // Same T + blob height as empty-board / chat brand mark
import { cn } from '@/lib/utils'
import { requestOpenChatForBoardLink } from '@/lib/ai/open-chat-turn'
import type { ChatTurnSide } from '@/lib/ai/chat-board-links'

type Side = ChatTurnSide

type ChatLinkConnectionCueProps = {
  side: Side
  frameMessageId: string // Board messages.id — reverse-lookup the chat turn
  indicatorStyle: CSSProperties // Same outset placement as a normal blue simulator
  indicatorSize: number // Dot diameter (flow px)
  isThreadConnecting: boolean // While connecting, indicators are paint-only
}

/** Aspect of the cropped T viewBox (width / height). */
const T_ASPECT = 35 / 63

/** Read outset distance from the shared indicator placement style. */
function outsetFromIndicatorStyle(style: CSSProperties, side: Side): number {
  if (side === 'left' && typeof style.left === 'number') return -style.left
  if (side === 'right' && typeof style.right === 'number') return -style.right
  if (side === 'top' && typeof style.top === 'number') return -style.top
  if (side === 'bottom' && typeof style.bottom === 'number') return -style.bottom
  return 14
}

/**
 * Anchor the row so the *dot center* sits on the connection point
 * (same place as a normal simulator). The T sits left; disc is blob-height on the T.
 */
function stackAnchorStyle(
  side: Side,
  out: number,
  size: number,
  lineW: number,
  gap: number,
  lineH: number
): CSSProperties {
  // Row is [T][gap][dot]. Dot is lowered to NN_BLOB_CY_FRAC on the T — shift so its center hits the point.
  const xLeft = `-${lineW + gap + size / 2}px` // left / top / bottom (left-anchored or mid)
  const xRight = `${size / 2}px` // right-anchored: row’s right edge is the dot’s right edge
  const y = `-${lineH * NN_BLOB_CY_FRAC}px` // Blob center on the T → connection point
  if (side === 'left') {
    return { left: -out, top: '50%', transform: `translate(${xLeft}, ${y})` }
  }
  if (side === 'right') {
    return { right: -out, top: '50%', transform: `translate(${xRight}, ${y})` }
  }
  if (side === 'top') {
    return { top: -out, left: '50%', transform: `translate(${xLeft}, ${y})` }
  }
  // Bottom: measure from the frame bottom edge + outset (same mid as a normal indicator)
  return {
    top: `calc(100% + ${out}px)`,
    left: '50%',
    transform: `translate(${xLeft}, ${y})`,
  }
}

/**
 * Blue simulator at the normal connection-point spot + brand T to its left,
 * disc centered on the brand blob height (same relative place on every side).
 * Click → open chat / select linked turn; drag past slop → start a thread.
 */
export function ChatLinkConnectionCue({
  side,
  frameMessageId,
  indicatorStyle,
  indicatorSize,
  isThreadConnecting,
}: ChatLinkConnectionCueProps) {
  const out = outsetFromIndicatorStyle(indicatorStyle, side)
  const lineH = indicatorSize * 1.35 // Stay under the dot so the cue reads as a mark, not a hook
  const lineW = lineH * T_ASPECT * 0.95 // Near-natural width of the hand-drawn T
  const gap = indicatorSize * 0.08 // Tight air between line and dot
  // Top of the disc so its center matches the table-blob on the brand mark
  const dotTop = lineH * NN_BLOB_CY_FRAC - indicatorSize / 2

  return (
    <div
      className="nodrag nopan absolute z-[30] flex flex-row items-start"
      style={stackAnchorStyle(side, out, indicatorSize, lineW, gap, lineH)}
      data-tt-chat-link-cue={side}
    >
      {/* Brand T — left of the disc (simulator replaces the table-dot at blob height) */}
      <svg
        aria-hidden
        className="pointer-events-none shrink-0"
        viewBox={NN_CONNECTION_T_VIEWBOX}
        style={{ width: lineW, height: lineH, marginRight: gap }}
      >
        <path fill="#3b82f6" d={NN_CONNECTION_T_PATH} />
      </svg>
      {/* Dot slot — center of this box is the connection point */}
      <div
        className="relative shrink-0"
        style={{
          width: indicatorSize,
          height: indicatorSize,
          marginTop: Math.max(0, dotTop), // Match brand blob Y on the T
        }}
      >
        <ConnectionIndicator
          side={side}
          onPlainClick={() => requestOpenChatForBoardLink(frameMessageId, side)}
          className={cn(
            'nodrag nopan absolute inset-0 z-[30] rounded-full border border-white bg-blue-500 shadow-sm',
            isThreadConnecting
              ? 'pointer-events-none'
              : 'cursor-crosshair hover:bg-blue-600'
          )}
          style={{
            left: 0,
            top: 0,
            right: 'auto',
            bottom: 'auto',
            width: indicatorSize,
            height: indicatorSize,
            transform: 'none', // Parent stack already centers the dot on the point
          }}
        />
      </div>
    </div>
  )
}
