// Chat-linked connection cue: keep the normal blue simulator on the connection
// point, and place the brand T (hand-drawn arm from Nod notes icon 3) to the left
// of the dot. Disc sits at the table-blob height on the T (not top-aligned).
// Click opens chat with the linked turn selected; drag still starts a board thread.
// Size tracks live `--tt-frame-ui-scale` (constant on screen) — not React zoom.

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
  isThreadConnecting: boolean // While connecting, indicators are paint-only
}

/** Aspect of the cropped T viewBox (width / height). */
const T_ASPECT = 35 / 63

/** Base (pre–ui-scale) dot diameter — parent scale keeps it constant on screen. */
const DOT = 8

/**
 * Blue simulator at the normal connection-point spot + brand T to its left,
 * disc centered on the brand blob height (same relative place on every side).
 * Click → open chat / select linked turn; drag past slop → start a thread.
 */
export function ChatLinkConnectionCue({
  side,
  frameMessageId,
  isThreadConnecting,
}: ChatLinkConnectionCueProps) {
  const lineH = DOT * 1.35 // Stay under the dot so the cue reads as a mark, not a hook
  const lineW = lineH * T_ASPECT * 0.95 // Near-natural width of the hand-drawn T
  const gap = DOT * 0.08 // Tight air between line and dot
  // Dot center in the flex row (= connection point) — scale pivots here
  const originX = lineW + gap + DOT / 2
  const originY = lineH * NN_BLOB_CY_FRAC
  // Top of the disc so its center matches the table-blob on the brand mark
  const dotTop = originY - DOT / 2

  return (
    // 0×0 anchor — CSS places this on the connection point (scaled outset)
    <div
      className="nodrag nopan absolute z-[30] h-0 w-0"
      data-tt-chat-link-cue={side}
    >
      {/* Base-sized mark; scale from the connection point via live --tt-frame-ui-scale */}
      <div
        className="absolute flex flex-row items-start"
        style={{
          left: -originX, // Pull so originX lands on the 0×0 anchor
          top: -originY,
          transform: 'scale(var(--tt-frame-ui-scale, 1.4))', // Constant screen size
          transformOrigin: `${originX}px ${originY}px`, // Keep the connection point fixed
        }}
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
            width: DOT,
            height: DOT,
            marginTop: Math.max(0, dotTop), // Match brand blob Y on the T
          }}
        >
          <ConnectionIndicator
            side={side}
            onPlainClick={() => requestOpenChatForBoardLink(frameMessageId, side)}
            className={cn(
              // Parent already scales — fixed local border stays screen-constant
              'nodrag nopan absolute inset-0 z-[30] rounded-full bg-blue-500',
              isThreadConnecting
                ? 'pointer-events-none'
                : 'cursor-crosshair hover:bg-blue-600'
            )}
            style={{
              left: 0,
              top: 0,
              right: 'auto',
              bottom: 'auto',
              width: DOT,
              height: DOT,
              borderWidth: 1.5, // Local px; parent --tt-frame-ui-scale keeps it constant on screen
              borderStyle: 'solid',
              borderColor: '#ffffff',
              boxSizing: 'border-box',
              transform: 'none', // Parent scale already sizes the mark
            }}
          />
        </div>
      </div>
    </div>
  )
}
