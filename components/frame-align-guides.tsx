'use client'

// Blue segments while a frame drag lines up with another frame.
// Drawn in screen space on the pane (RF children sit outside the viewport transform).

import { useEffect, useRef, useSyncExternalStore } from 'react'
import { useStore } from 'reactflow'
import { shallow } from 'zustand/shallow'
import {
  readFrameAlignGuides,
  subscribeFrameAlignGuides,
  type FrameAlignGuide,
} from '@/lib/frame-align-guides'

const IDLE = [0, 0, 1, 0, 0] as const // Stable selector result — pan must not repaint with no guides
const GUIDE_COLOR = '#3b82f6' // --nod-blue

/** Pane overlay. Subscribes to guide geometry, not board node state. */
export function FrameAlignGuides() {
  const guides = useSyncExternalStore(subscribeFrameAlignGuides, readFrameAlignGuides, readFrameAlignGuides)
  const hasLines = guides.length > 0
  const [tx, ty, zoom, width, height] = useStore((state) => {
    if (!hasLines) return IDLE // No segment: viewport ticks must not redraw this canvas
    const [x, y, z] = state.transform
    return [x, y, z, state.width, state.height] as const // Numbers so a mutated transform tuple still compares
  }, shallow)
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx || width <= 0 || height <= 0) return
    const dpr = window.devicePixelRatio || 1 // Keep a 1px stroke crisp on retina
    canvas.width = width * dpr
    canvas.height = height * dpr
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, width, height)
    ctx.strokeStyle = GUIDE_COLOR
    ctx.lineWidth = 1
    for (const guide of guides) {
      strokeGuide(ctx, guide, tx, ty, zoom) // Flow → pane pixels (this canvas is not inside the viewport)
    }
  }, [guides, tx, ty, zoom, width, height])

  if (!hasLines) return null
  return <canvas ref={canvasRef} className="react-flow__canvas" aria-hidden="true" />
}

function strokeGuide(
  ctx: CanvasRenderingContext2D,
  guide: FrameAlignGuide,
  tx: number,
  ty: number,
  zoom: number,
): void {
  ctx.beginPath()
  if (guide.orientation === 'vertical') {
    const x = Math.round(guide.position * zoom + tx) + 0.5 // Pixel center so the stroke stays 1px
    ctx.moveTo(x, guide.from * zoom + ty)
    ctx.lineTo(x, guide.to * zoom + ty)
  } else {
    const y = Math.round(guide.position * zoom + ty) + 0.5
    ctx.moveTo(guide.from * zoom + tx, y)
    ctx.lineTo(guide.to * zoom + tx, y)
  }
  ctx.stroke()
}
