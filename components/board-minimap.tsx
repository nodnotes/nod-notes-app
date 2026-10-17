'use client'

import {
  memo,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type MouseEvent as ReactMouseEvent,
} from 'react'
import { shallow } from 'zustand/shallow'
import { zoom, zoomIdentity } from 'd3-zoom'
import { select, pointer } from 'd3-selection'
import {
  useStore,
  useStoreApi,
  getNodePositionWithOrigin,
  getNodesBounds,
  type Node,
  type ReactFlowState,
} from '@reactflow/core'
import { cn } from '@/lib/utils'
import {
  clampMinimapScopeZoom,
  computeMinimapGeometry,
  minimapClientToFlow,
  minimapGrabbedViewOrigin,
  minimapScopeForHalfView,
  minimapViewportMaskRect,
  readMinimapViewBox,
  type MinimapFlowRect,
} from '@/lib/minimap-geometry'

type BoardMiniMapProps = {
  className?: string
  style?: CSSProperties
  nodeColor?: string | ((node: Node) => string)
  maskColor?: string
  maskStrokeColor?: string
  pannable?: boolean
  zoomable?: boolean
  inversePan?: boolean
  zoomStep?: number
  offsetScale?: number
  ariaLabel?: string
  onClick?: (event: ReactMouseEvent, position: { x: number; y: number }) => void
}

const ARIA_LABEL_KEY = 'nodnotes-minimap-desc'

function asColorFn(color: string | ((node: Node) => string) | undefined, fallback: string) {
  if (typeof color === 'function') return color
  const fixed = color ?? fallback
  return () => fixed
}

function isMinimapNode(n: Node) {
  return (
    !n.hidden &&
    !!n.width &&
    !!n.height &&
    n.type !== 'frameShimmer' &&
    n.type !== 'placeholder'
  )
}

/** Viewport + content AABBs for viewBox (no node list — keeps store compares cheap). */
function selectMinimapFrame(s: ReactFlowState) {
  const nodes = s.getNodes().filter(isMinimapNode)
  const z = s.transform[2]
  const viewBB: MinimapFlowRect = {
    x: -s.transform[0] / z,
    y: -s.transform[1] / z,
    width: s.width / z,
    height: s.height / z,
  }
  const content: MinimapFlowRect | null =
    nodes.length > 0 ? getNodesBounds(nodes, s.nodeOrigin) : null
  return { viewBB, content, rfId: s.rfId }
}

function rectEq(a: MinimapFlowRect | null, b: MinimapFlowRect | null) {
  if (a === b) return true
  if (!a || !b) return false
  return a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height
}

function minimapFrameEq(
  a: ReturnType<typeof selectMinimapFrame>,
  b: ReturnType<typeof selectMinimapFrame>
) {
  return a.rfId === b.rfId && rectEq(a.viewBB, b.viewBB) && rectEq(a.content, b.content)
}

const selectMinimapNodes = (s: ReactFlowState) => s.getNodes().filter(isMinimapNode)
const selectNodeOrigin = (s: ReactFlowState) => s.nodeOrigin

/**
 * Board minimap framed to the full board. The mask hole is the current view.
 * Renders in the Free-nav chrome slot (not RF Panel) — still needs ReactFlowProvider.
 */
function BoardMiniMapInner({
  className,
  style,
  nodeColor = '#e5e7eb',
  maskColor = 'rgba(200, 200, 200, 0.2)',
  maskStrokeColor = 'none',
  pannable = false,
  zoomable = false,
  inversePan = false,
  zoomStep = 10,
  offsetScale = 5,
  ariaLabel = 'Board mini map',
  onClick,
}: BoardMiniMapProps) {
  const store = useStoreApi()
  const svgRef = useRef<SVGSVGElement>(null)
  // Pointer-down flow + viewport + the viewBox used for the whole drag (must stay fixed)
  const grabRef = useRef<{
    px: number
    py: number
    vx: number
    vy: number
    zoom: number
    viewBox: MinimapFlowRect
  } | null>(null)
  // Auto = follow board zoom; manual = wheel on the minimap until the next board zoom
  const [scopeMode, setScopeMode] = useState<'auto' | 'manual'>('auto')
  const [manualScopeZoom, setManualScopeZoom] = useState(1)
  const scopeModeRef = useRef(scopeMode)
  scopeModeRef.current = scopeMode
  const scopeZoomRef = useRef(1) // Wheel scrub starts from the live effective scope
  // Freeze auto scope for the whole minimap drag so half-view does not rescale mid-gesture
  const dragScopeZoomRef = useRef<number | null>(null)
  const [, setDragEpoch] = useState(0) // Re-render when drag ends so auto scope resumes
  const { viewBB, content, rfId } = useStore(selectMinimapFrame, minimapFrameEq)
  const boardZoom = useStore((s) => s.transform[2]) // Board zoom drops manual override
  const prevBoardZoomRef = useRef(boardZoom)
  const nodes = useStore(selectMinimapNodes, shallow)
  const nodeOrigin = useStore(selectNodeOrigin)

  // Board zoom (pinch / Free nav / wheel on the map) drops a manual override
  useEffect(() => {
    if (Math.abs(prevBoardZoomRef.current - boardZoom) < 1e-6) return
    prevBoardZoomRef.current = boardZoom
    if (scopeModeRef.current === 'manual') setScopeMode('auto')
  }, [boardZoom])

  const elementWidth = typeof style?.width === 'number' ? style.width : 196
  const elementHeight = typeof style?.height === 'number' ? style.height : 120
  const liveAutoScope = minimapScopeForHalfView(
    viewBB,
    content,
    elementWidth,
    elementHeight,
    offsetScale
  )
  const scopeZoom =
    dragScopeZoomRef.current ??
    (scopeMode === 'manual' ? manualScopeZoom : liveAutoScope)
  scopeZoomRef.current = scopeZoom

  // Frame the live board camera (full board view) — not the content AABB
  const geometry = computeMinimapGeometry(
    viewBB,
    content,
    elementWidth,
    elementHeight,
    offsetScale,
    scopeZoom
  )
  // Hole = full board camera (same aspect / extent as the pane)
  const maskRect = minimapViewportMaskRect(
    geometry.viewBB,
    { x: geometry.x, y: geometry.y, width: geometry.width, height: geometry.height },
    geometry.viewScale
  )
  const colorFn = asColorFn(nodeColor, '#e5e7eb')
  const labelledBy = `${ARIA_LABEL_KEY}-${rfId}`
  const shapeRendering =
    typeof window === 'undefined' || !!(window as Window & { chrome?: unknown }).chrome
      ? 'crispEdges'
      : 'geometricPrecision'

  // Desktop mouse pan / wheel scope on the SVG (phone pan is wired in board-flow)
  useEffect(() => {
    if (!svgRef.current) return
    const selection = select(svgRef.current)

    // Wheel zooms how much of the board the minimap shows — not the board camera
    const scopeHandler = (event: { sourceEvent?: Event }) => {
      if (event.sourceEvent?.type !== 'wheel') return
      const e = event.sourceEvent as WheelEvent
      e.preventDefault() // Own the gesture so the page / board do not zoom
      e.stopPropagation()
      const pinchDelta =
        -e.deltaY *
        (e.deltaMode === 1 ? 0.05 : e.deltaMode ? 1 : 0.002) *
        zoomStep
      const next = clampMinimapScopeZoom(scopeZoomRef.current * Math.pow(2, pinchDelta))
      scopeZoomRef.current = next
      setManualScopeZoom(next) // Stick until the next board zoom
      setScopeMode('manual')
    }

    // Prefer the drag-frozen viewBox so a mid-pan React paint cannot shift the mapping
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
      if (!e || e.type !== 'mousedown') return // Wheel zoom also starts a gesture
      const mouse = e as MouseEvent
      const svg = svgRef.current
      const viewBox = readMinimapViewBox(svg) // Freeze this for every move in the gesture
      if (!viewBox) return
      const flow = flowUnderPointer(mouse.clientX, mouse.clientY, viewBox)
      if (!flow) return
      const t = store.getState().transform
      const zoom = t[2] || 1
      grabRef.current = {
        px: flow.x, // Flow point under the pointer
        py: flow.y,
        vx: -t[0] / zoom, // Viewport origin at pointer-down
        vy: -t[1] / zoom,
        zoom, // Drag must not change zoom
        viewBox, // Same CSS→flow space for the whole drag
      }
      dragScopeZoomRef.current = scopeZoomRef.current // Hold auto half-view scale still for the drag
    }

    const panHandler = (event: { sourceEvent?: Event }) => {
      const {
        d3Selection,
        d3Zoom,
        translateExtent,
        width,
        height,
      } = store.getState()
      const e = event.sourceEvent
      if (!e || e.type !== 'mousemove' || !grabRef.current || !d3Selection || !d3Zoom) return
      const mouse = e as MouseEvent
      const flow = flowUnderPointer(mouse.clientX, mouse.clientY, grabRef.current.viewBox)
      if (!flow) return
      const origin = minimapGrabbedViewOrigin(
        flow.x,
        flow.y,
        grabRef.current.px,
        grabRef.current.py,
        grabRef.current.vx,
        grabRef.current.vy,
        inversePan
      )
      const zoom = grabRef.current.zoom // Zoom from pointer-down, not the live camera
      svgRef.current?.setAttribute('data-minimap-drag', '1') // So a click-to-fit cannot run after this drag
      const next = zoomIdentity.translate(-origin.x * zoom, -origin.y * zoom).scale(zoom)
      const extent: [[number, number], [number, number]] = [
        [0, 0],
        [width, height],
      ]
      d3Zoom.transform(d3Selection, d3Zoom.constrain()(next, extent, translateExtent))
    }

    const zoomAndPanHandler = zoom<SVGSVGElement, unknown>()
    if (pannable) {
      zoomAndPanHandler.on('start', startHandler) // Remember the flow point under the pointer
      zoomAndPanHandler.on('zoom', panHandler) // Keep that point under the pointer
      zoomAndPanHandler.on('end', () => {
        grabRef.current = null
        dragScopeZoomRef.current = null // Resume auto half-view from the landed camera
        setDragEpoch((n) => n + 1) // Ref clear alone would not re-render
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
  }, [store, pannable, zoomable, inversePan, zoomStep])

  return (
    <div
      className={cn('react-flow__minimap', className)}
      data-testid="rf__minimap"
      style={{ touchAction: 'none', ...style }}
    >
      <svg
        ref={svgRef}
        width={elementWidth}
        height={elementHeight}
        viewBox={geometry.viewBox}
        role="img"
        aria-labelledby={labelledBy}
        onClick={
          onClick
            ? (event) => {
                const rfCoord = pointer(event)
                onClick(event, { x: rfCoord[0], y: rfCoord[1] })
              }
            : undefined
        }
      >
        {ariaLabel ? <title id={labelledBy}>{ariaLabel}</title> : null}
        {nodes.map((node) => {
          const { x, y } = getNodePositionWithOrigin(node, nodeOrigin).positionAbsolute
          const w = node.width ?? 0
          const h = node.height ?? 0
          return (
            <rect
              key={node.id}
              className={cn('react-flow__minimap-node', node.selected && 'selected')}
              x={x}
              y={y}
              width={w}
              height={h}
              rx={5}
              ry={5}
              fill={colorFn(node)}
              stroke="transparent"
              shapeRendering={shapeRendering}
            />
          )
        })}
        <path
          className="react-flow__minimap-mask"
          d={`M${geometry.x - geometry.offset},${geometry.y - geometry.offset}h${geometry.width + geometry.offset * 2}v${geometry.height + geometry.offset * 2}h${-geometry.width - geometry.offset * 2}z
        M${maskRect.x},${maskRect.y}h${maskRect.width}v${maskRect.height}h${-maskRect.width}z`}
          fill={maskColor}
          fillRule="evenodd"
          stroke={maskStrokeColor}
          pointerEvents="none"
        />
      </svg>
    </div>
  )
}

export const BoardMiniMap = memo(BoardMiniMapInner)
BoardMiniMap.displayName = 'BoardMiniMap'
