'use client'

import { useEffect, useMemo, useRef } from 'react'
import { zoom } from 'd3-zoom'
import { select } from 'd3-selection'
import { cn } from '@/lib/utils'
import {
  computePreviewMinimapGeometry,
  type PreviewMinimapState,
} from '@/lib/preview-host-minimap'

type PreviewMinimapProps = {
  state: PreviewMinimapState
  width: number
  height: number
  resolvedTheme?: string
  className?: string
  style?: React.CSSProperties
  onPan?: (movementX: number, movementY: number, viewScale: number) => void
  onWheelZoom?: (nextZoom: number) => void
  /** Wheel scrub base zoom — host viewport when minimap mirrors a preview. */
  wheelZoomBase?: number
  zoomStep?: number
}

/** Host-side minimap that mirrors a nested preview board via postMessage snapshot. */
export function PreviewMinimap({
  state,
  width,
  height,
  resolvedTheme,
  className,
  style,
  onPan,
  onWheelZoom,
  wheelZoomBase,
  zoomStep = 10,
}: PreviewMinimapProps) {
  const svgRef = useRef<SVGSVGElement>(null)
  const viewScaleRef = useRef(0)
  const onPanRef = useRef(onPan)
  const onWheelZoomRef = useRef(onWheelZoom)
  const wheelZoomBaseRef = useRef(wheelZoomBase ?? state.transform[2])
  onPanRef.current = onPan
  onWheelZoomRef.current = onWheelZoom
  wheelZoomBaseRef.current = wheelZoomBase ?? state.transform[2]

  const geometry = useMemo(
    () => computePreviewMinimapGeometry(state, width, height),
    [state, width, height]
  )
  viewScaleRef.current = geometry.viewScale

  // Pan → preview board; wheel → host board (same split as RF MiniMap on the host map).
  useEffect(() => {
    if (!svgRef.current) return
    const selection = select(svgRef.current)

    const panHandler = (event: { sourceEvent?: Event }) => {
      if (event.sourceEvent?.type !== 'mousemove') return
      const cb = onPanRef.current
      if (!cb) return
      const e = event.sourceEvent as MouseEvent
      cb(e.movementX, e.movementY, viewScaleRef.current)
    }

    const wheelHandler = (event: { sourceEvent?: Event }) => {
      if (event.sourceEvent?.type !== 'wheel') return
      const cb = onWheelZoomRef.current
      if (!cb) return
      const e = event.sourceEvent as WheelEvent
      e.preventDefault()
      const pinchDelta =
        -e.deltaY *
        (e.deltaMode === 1 ? 0.05 : e.deltaMode ? 1 : 0.002) *
        zoomStep
      cb(wheelZoomBaseRef.current * Math.pow(2, pinchDelta))
    }

    const zoomAndPanHandler = zoom<SVGSVGElement, unknown>()
      .on('zoom', onPan ? panHandler : null)
      .on('zoom.wheel', onWheelZoom ? wheelHandler : null)

    selection.call(zoomAndPanHandler)

    return () => {
      selection.on('zoom', null)
    }
  }, [onPan, onWheelZoom, zoomStep, wheelZoomBase, state.transform])

  const maskColor =
    resolvedTheme === 'dark' ? 'rgba(42, 42, 58, 0.35)' : 'rgba(200, 200, 200, 0.2)'

  return (
    <div
      className={cn('react-flow__minimap minimap-custom-size shadow-sm', className)}
      data-testid="rf__minimap"
      data-preview-minimap
      style={{ touchAction: 'none', ...style }}
    >
      <svg
        ref={svgRef}
        width={width}
        height={height}
        viewBox={geometry.viewBox}
        role="img"
        aria-label="Nested board mini map"
      >
        <title>Nested board mini map</title>
        {state.nodes.map((node) => (
          <rect
            key={node.id}
            className={cn('react-flow__minimap-node', node.selected && 'selected')}
            x={node.x}
            y={node.y}
            width={node.width}
            height={node.height}
            rx={5}
            ry={5}
            fill={node.selected ? '#9ca3af' : '#e5e7eb'}
            stroke="transparent"
          />
        ))}
        <path
          className="react-flow__minimap-mask"
          d={`M${geometry.x - geometry.offset},${geometry.y - geometry.offset}h${geometry.width + geometry.offset * 2}v${geometry.height + geometry.offset * 2}h${-geometry.width - geometry.offset * 2}z
        M${geometry.viewBB.x},${geometry.viewBB.y}h${geometry.viewBB.width}v${geometry.viewBB.height}h${-geometry.viewBB.width}z`}
          fill={maskColor}
          fillRule="evenodd"
          stroke="none"
          pointerEvents="none"
        />
      </svg>
    </div>
  )
}
