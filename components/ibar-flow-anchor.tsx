'use client'

// Portaled I-bar chrome — subscribes to RF viewport locally so BoardFlow doesn't re-render on pan/zoom.

import type { ReactNode } from 'react'
import { useStore } from 'reactflow'
import { flowToPane } from '@/lib/board-rotation'
import { navigationZoom } from '@/lib/board-navigating'
import { ibarPaneScale } from '@/lib/ibar-place-scale' // Screen-stable place size (clamped 1/zoom)

export function IBarFlowAnchor({
  flowX,
  flowY,
  boardRotation,
  children,
}: {
  flowX: number
  flowY: number
  boardRotation: number
  children: (layout: { left: number; top: number; paneScale: number }) => ReactNode
}) {
  // Position uses live zoom (matches screenToFlowPosition / onPaneClick).
  const viewport = useStore(
    (s) => ({
      x: s.transform[0] ?? 0,
      y: s.transform[1] ?? 0,
      liveZoom: s.transform[2] || 1,
    }),
    (a, b) => a.x === b.x && a.y === b.y && a.liveZoom === b.liveZoom
  )
  const pane = flowToPane(flowX, flowY, { x: viewport.x, y: viewport.y, zoom: viewport.liveZoom }, boardRotation)
  // Freeze mid-pinch; place scale keeps caret ~same screen size as 100% (clamped at extremes).
  const scaleZoom = navigationZoom(Math.round(viewport.liveZoom * 8) / 8)
  const paneScale = ibarPaneScale(scaleZoom)
  return <>{children({ left: pane.x, top: pane.y, paneScale })}</>
}
