'use client'

import type { CSSProperties } from 'react'

// Absolute SVG silhouette behind frame / nest content — fill + stroke from View colors.
// Pointer-events none so TipTap / resize chrome stay interactive.

import Shape from '@/components/shapes/Shape' // Shared SVG silhouette renderer
import type { FrameShapeType } from '@/lib/frame-shape' // Silhouette id
import { cn } from '@/lib/utils' // Class merge

type FrameShapeBackdropProps = {
  type: FrameShapeType // Which silhouette to paint
  width: number // Frame box width (CSS px)
  height: number // Frame box height (CSS px)
  fill?: string // Fill color (transparent when unset)
  fillOpacity?: number // Soft fill like ShapeNode
  stroke?: string // Outline color
  strokeWidth?: number // Outline weight in px
  className?: string // Extra positioning classes
  style?: CSSProperties // Position inside padded frame chrome (content box)
}

/** Paints the frame silhouette flush to the parent box (parent must be `relative`). */
export function FrameShapeBackdrop({
  type,
  width,
  height,
  fill = 'transparent',
  fillOpacity = 0.35,
  stroke = '#3F8AE2',
  strokeWidth = 2,
  className,
  style,
}: FrameShapeBackdropProps) {
  const w = Math.max(1, Math.round(width)) // Avoid zero SVG viewBox
  const h = Math.max(1, Math.round(height))
  const noFill = fill === 'transparent' || fill === ''

  return (
    <div
      aria-hidden
      data-frame-shape-backdrop={type} // Debug / CSS hooks
      className={cn('pointer-events-none absolute z-0 overflow-visible', className)}
      style={{ left: 0, top: 0, right: 0, bottom: 0, ...style }}
    >
      <Shape
        type={type}
        width={w}
        height={h}
        fill={noFill ? 'transparent' : fill}
        fillOpacity={noFill ? 0 : fillOpacity}
        stroke={stroke}
        strokeWidth={strokeWidth}
        className="shape-svg h-full w-full"
      />
    </div>
  )
}
