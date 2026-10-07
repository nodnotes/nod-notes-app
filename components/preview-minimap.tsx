'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { zoom } from 'd3-zoom'
import { select } from 'd3-selection'
import { cn } from '@/lib/utils'
import {
  clampMinimapScopeZoom,
  minimapClientToFlow,
  minimapGrabbedViewOrigin,
  minimapViewportMaskRect,
  readMinimapViewBox,
  type MinimapFlowRect,
} from '@/lib/minimap-geometry'
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
  onPan?: (x: number, y: number, zoom: number) => void // RF translate that keeps the grab under the pointer
  zoomable?: boolean // Wheel zooms minimap scope, not the host board
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
  zoomable = true,
  zoomStep = 10,
}: PreviewMinimapProps) {
  const svgRef = useRef<SVGSVGElement>(null)
  const transformRef = useRef(state.transform) // Nested camera; the drag handler must not close over a stale one
  // Pointer-down flow + viewport + frozen viewBox for the whole drag
  const grabRef = useRef<{
    px: number
    py: number
    vx: number
    vy: number
    zoom: number
    viewBox: MinimapFlowRect
  } | null>(null)
  const onPanRef = useRef(onPan)
  onPanRef.current = onPan
  const [scopeZoom, setScopeZoom] = useState(1) // Minimap framing only — never the host board
  const scopeZoomRef = useRef(1) // Wheel handler must not close over a stale scope
  scopeZoomRef.current = scopeZoom
  // Freeze only while minimap-dragging; otherwise follow the nested camera so nodes pan
  const dragScopeCenterRef = useRef<{ x: number; y: number } | null>(null)
  const [dragEpoch, setDragEpoch] = useState(0) // Re-render when drag ends so live center resumes

  const zoom = state.transform[2] || 1
  const liveScopeCenter =
    scopeZoom > 1
      ? {
          x: -state.transform[0] / zoom + state.width / zoom / 2,
          y: -state.transform[1] / zoom + state.height / zoom / 2,
        }
      : null
  const geometry = useMemo(
    () =>
      computePreviewMinimapGeometry(
        state,
        width,
        height,
        5,
        scopeZoom,
        dragScopeCenterRef.current ?? liveScopeCenter
      ),
    // dragEpoch bumps after drag so the frozen ref is dropped from geometry
    [state, width, height, scopeZoom, liveScopeCenter, dragEpoch]
  )
  // Hole leaves a min dimmed band so out-of-view mask stays visible when zoomed out
  const maskRect = useMemo(
    () =>
      minimapViewportMaskRect(
        geometry.viewBB,
        { x: geometry.x, y: geometry.y, width: geometry.width, height: geometry.height },
        geometry.viewScale
      ),
    [geometry.viewBB, geometry.x, geometry.y, geometry.width, geometry.height, geometry.viewScale]
  )
  transformRef.current = state.transform

  // Pan → preview board; wheel → minimap scope (same as BoardMiniMap).
  useEffect(() => {
    if (!svgRef.current) return
    const selection = select(svgRef.current)

    const flowUnderPointer = (
      clientX: number,
      clientY: number,
      frozen?: MinimapFlowRect | null
    ) => {
      const svg = svgRef.current
      if (!svg) return null
      const viewBox = frozen ?? readMinimapViewBox(svg)
      if (!viewBox) return null
      return minimapClientToFlow(clientX, clientY, svg.getBoundingClientRect(), viewBox)
    }

    const startHandler = (event: { sourceEvent?: Event }) => {
      const e = event.sourceEvent
      if (!e || e.type !== 'mousedown') return
      const mouse = e as MouseEvent
      const viewBox = readMinimapViewBox(svgRef.current) // Freeze for every move in the gesture
      if (!viewBox) return
      const flow = flowUnderPointer(mouse.clientX, mouse.clientY, viewBox)
      if (!flow) return
      const t = transformRef.current
      const zoom = t[2] || 1
      grabRef.current = {
        px: flow.x,
        py: flow.y,
        vx: -t[0] / zoom,
        vy: -t[1] / zoom,
        zoom, // Pin zoom so the drag cannot rescale
        viewBox,
      }
      dragScopeCenterRef.current = {
        x: viewBox.x + viewBox.width / 2,
        y: viewBox.y + viewBox.height / 2,
      }
    }

    const panHandler = (event: { sourceEvent?: Event }) => {
      if (event.sourceEvent?.type !== 'mousemove') return
      const cb = onPanRef.current
      const grab = grabRef.current
      if (!cb || !grab) return
      const e = event.sourceEvent as MouseEvent
      const flow = flowUnderPointer(e.clientX, e.clientY, grab.viewBox)
      if (!flow) return
      const origin = minimapGrabbedViewOrigin(flow.x, flow.y, grab.px, grab.py, grab.vx, grab.vy)
      const zoom = grab.zoom // Zoom from pointer-down, not a later snapshot
      svgRef.current?.setAttribute('data-minimap-drag', '1') // Host click-to-fit skips this gesture
      cb(-origin.x * zoom, -origin.y * zoom, zoom) // Screen translate for the nested camera
    }

    // Wheel zooms how much of the nested board the minimap shows — not the host camera
    const scopeHandler = (event: { sourceEvent?: Event }) => {
      if (event.sourceEvent?.type !== 'wheel') return
      const e = event.sourceEvent as WheelEvent
      e.preventDefault()
      e.stopPropagation()
      const pinchDelta =
        -e.deltaY *
        (e.deltaMode === 1 ? 0.05 : e.deltaMode ? 1 : 0.002) *
        zoomStep
      const next = clampMinimapScopeZoom(scopeZoomRef.current * Math.pow(2, pinchDelta))
      scopeZoomRef.current = next
      setScopeZoom(next) // liveScopeCenter tracks the nested camera while scopeZoom > 1
    }

    const zoomAndPanHandler = zoom<SVGSVGElement, unknown>()
    if (onPan) {
      zoomAndPanHandler.on('start', startHandler)
      zoomAndPanHandler.on('zoom', panHandler)
      zoomAndPanHandler.on('end', () => {
        grabRef.current = null
        dragScopeCenterRef.current = null
        setDragEpoch((n) => n + 1) // Resume following the camera
      })
    }
    if (zoomable) zoomAndPanHandler.on('zoom.wheel', scopeHandler)

    selection.call(zoomAndPanHandler)

    return () => {
      selection.on('start', null)
      selection.on('zoom', null)
      selection.on('end', null)
      selection.on('zoom.wheel', null)
    }
  }, [onPan, zoomable, zoomStep, state.transform, state.width, state.height, width, height])

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
        M${maskRect.x},${maskRect.y}h${maskRect.width}v${maskRect.height}h${-maskRect.width}z`}
          fill={maskColor}
          fillRule="evenodd"
          stroke="none"
          pointerEvents="none"
        />
      </svg>
    </div>
  )
}
