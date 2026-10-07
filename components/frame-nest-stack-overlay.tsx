'use client'

// Snap preview: dashed stack line between connection simulators while dragging.

import { createPortal } from 'react-dom' // Screen-fixed overlay
import type { FrameNestStackUi } from '@/components/use-frame-nest-stack-drag'
import { THREAD_DEFAULT_COLOR, frameScreenChromeScale } from '@/components/threads/constants'
import { INDICATOR_OUTSET } from '@/components/threads/handle-ids'
import { stackGapMarkPoint } from '@/lib/frame-stack-line'

/** Diamond centered in the snap gap while a frame is dragged. */
export function FrameNestStackOverlay({ ui }: { ui: FrameNestStackUi | null }) {
  if (!ui || ui.mode !== 'snap' || typeof document === 'undefined') return null

  const { targetRect, sourceRect, stackSide, zoom } = ui
  const glyph = 8 * Math.max(0.01, zoom) // 8 flow px — matches the settled diamond at this zoom
  const outset = INDICATOR_OUTSET * frameScreenChromeScale(zoom) * Math.max(0.01, zoom) // Same screen distance as the connection dots
  const center = stackGapMarkPoint(
    { x: targetRect.left, y: targetRect.top, width: targetRect.width, height: targetRect.height },
    { x: sourceRect.left, y: sourceRect.top, width: sourceRect.width, height: sourceRect.height },
    stackSide,
    outset
  ) // Host's connection point, on the side facing the dragged frame

  return createPortal(
    <div
      data-tt-frame-drop-overlay
      className="pointer-events-none fixed inset-0 z-[9998]"
      aria-hidden
    >
      <div
        className="absolute"
        style={{
          left: center.x - glyph / 2, // Center the zoom-scaled diamond on the gap
          top: center.y - glyph / 2,
          width: glyph,
          height: glyph,
          background: THREAD_DEFAULT_COLOR,
          borderRadius: glyph / 4,
          transform: 'rotate(45deg)',
        }}
      />
    </div>,
    document.body
  )
}
