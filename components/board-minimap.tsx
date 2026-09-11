'use client'

import { memo, useEffect, useRef, type CSSProperties, type MouseEvent as ReactMouseEvent } from 'react'
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
import { computeMinimapGeometry, type MinimapFlowRect } from '@/lib/minimap-geometry'

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
 * Board minimap with symmetric zoom framing: frame blocks shrink when the view box
 * grows past content walls, and expand again when zooming into frames.
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
  const viewScaleRef = useRef(0)
  const { viewBB, content, rfId } = useStore(selectMinimapFrame, minimapFrameEq)
  const nodes = useStore(selectMinimapNodes, shallow)
  const nodeOrigin = useStore(selectNodeOrigin)

  const elementWidth = typeof style?.width === 'number' ? style.width : 179
  const elementHeight = typeof style?.height === 'number' ? style.height : 120
  const geometry = computeMinimapGeometry(
    viewBB,
    content,
    elementWidth,
    elementHeight,
    offsetScale
  )
  viewScaleRef.current = geometry.viewScale

  const colorFn = asColorFn(nodeColor, '#e5e7eb')
  const labelledBy = `${ARIA_LABEL_KEY}-${rfId}`
  const shapeRendering =
    typeof window === 'undefined' || !!(window as Window & { chrome?: unknown }).chrome
      ? 'crispEdges'
      : 'geometricPrecision'

  // Desktop mouse pan / wheel zoom on the SVG (phone pan is wired in board-flow)
  useEffect(() => {
    if (!svgRef.current) return
    const selection = select(svgRef.current)

    const zoomHandler = (event: { sourceEvent?: Event }) => {
      const { transform: t, d3Selection, d3Zoom } = store.getState()
      if (event.sourceEvent?.type !== 'wheel' || !d3Selection || !d3Zoom) return
      const e = event.sourceEvent as WheelEvent
      const pinchDelta =
        -e.deltaY *
        (e.deltaMode === 1 ? 0.05 : e.deltaMode ? 1 : 0.002) *
        zoomStep
      d3Zoom.scaleTo(d3Selection, t[2] * Math.pow(2, pinchDelta))
    }

    const panHandler = (event: { sourceEvent?: Event }) => {
      const {
        transform: t,
        d3Selection,
        d3Zoom,
        translateExtent,
        width,
        height,
      } = store.getState()
      if (event.sourceEvent?.type !== 'mousemove' || !d3Selection || !d3Zoom) return
      const e = event.sourceEvent as MouseEvent
      const moveScale = viewScaleRef.current * Math.max(1, t[2]) * (inversePan ? -1 : 1)
      const position = {
        x: t[0] - e.movementX * moveScale,
        y: t[1] - e.movementY * moveScale,
      }
      const extent: [[number, number], [number, number]] = [
        [0, 0],
        [width, height],
      ]
      const next = zoomIdentity.translate(position.x, position.y).scale(t[2])
      d3Zoom.transform(d3Selection, d3Zoom.constrain()(next, extent, translateExtent))
    }

    const zoomAndPanHandler = zoom<SVGSVGElement, unknown>()
    if (pannable) zoomAndPanHandler.on('zoom', panHandler)
    if (zoomable) zoomAndPanHandler.on('zoom.wheel', zoomHandler)
    selection.call(zoomAndPanHandler)

    return () => {
      selection.on('zoom', null)
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
        M${geometry.viewBB.x},${geometry.viewBB.y}h${geometry.viewBB.width}v${geometry.viewBB.height}h${-geometry.viewBB.width}z`}
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
