'use client'

// Kick the chrome zoom pump when a frame is selected.

import { useLayoutEffect } from 'react'
import {
  applyFrameChromeZoom,
  ensureFrameChromeZoomPump,
  readViewportZoom,
} from '@/lib/frame-chrome-zoom'

type Props = {
  selected: boolean
  panelRef: React.RefObject<HTMLElement | null>
}

/** Mount inside a selected frame — starts the viewport-CSS zoom pump. */
export function LiveFrameChromeZoom({ selected, panelRef }: Props) {
  useLayoutEffect(() => {
    if (!selected) return
    const panel = panelRef.current
    const root = panel?.closest('.react-flow') as HTMLElement | null
    const z = readViewportZoom(root) || 1
    applyFrameChromeZoom(z, root)
    ensureFrameChromeZoomPump()
  }, [selected, panelRef])

  return null
}
