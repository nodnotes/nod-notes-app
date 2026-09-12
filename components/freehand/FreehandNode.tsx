// Freehand drawing node — resizable stroke with frame-like rotate chrome below
import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react' // Fragment for per-side Handle pairs
import {
  NodeResizeControl, // Corner + edge resize (same as frames)
  ResizeControlVariant, // Line = edge hit targets
  Handle, // Invisible edge connection points (geometry + snap)
  Position, // Handle side enum
  type Node, // RF node shape
  type NodeProps, // Props for custom node components
  useReactFlow, // setNodes to push AABB while rotating
  useStore, // Live style.width/height — v11 does not pass width/height as node props
  useUpdateNodeInternals, // Remeasure chrome after AABB change
} from 'reactflow'
import { RotateCw } from 'lucide-react' // Same rotate glyph as frames
import { useTheme } from '@/components/theme-provider' // Dark/light resizer fill
import { createClient } from '@/lib/supabase/client' // Persist rotation into canvas_nodes.data
import { rotatedRectAabbSize } from '@/lib/frame-shape' // Upright box around rotated content
import { LiveFrameChromeZoom } from '@/components/live-frame-chrome-zoom' // Keep --tt-frame-ui-scale live while selected
import {
  ConnectionIndicator, // Outer blue simulated dots (same as frames)
  INDICATOR_OUTSET, // Gap under bottom connection point for rotate chrome
  useIsThreadConnecting,
  useIsNearThreadConnection,
} from '@/components/threads'
import { cn } from '@/lib/utils' // Indicator class merge (pointer-events while connecting)

import { DEFAULT_STROKE_SIZE, pointsToPath } from './path' // Stroke → SVG path
import { HIGHLIGHTER_OPACITY, type FreehandInkKind } from './ink' // Marker opacity + ink kind
import type { Points } from './types' // [x, y, pressure] tuples

const CONNECTION_SIDES = ['left', 'right', 'top', 'bottom'] as const // Same four sides as frames
const RESIZE_CORNERS = ['top-left', 'top-right', 'bottom-left', 'bottom-right'] as const // Circular adjust dots
const RESIZE_EDGES = ['top', 'right', 'bottom', 'left'] as const // Edge hit targets for the adjust ring
const FREEHAND_RESIZE_MIN = 40 // Soft floor — matches frame unlocked min

const ROTATE_CLICK_SLOP_PX = 4 // Below this travel → click resets; above → drag rotate (match frames)

/** Read RF v11 node box — prefer style (NodeResizer updateStyle), then width/height fields. */
function readNodeBox(
  node:
    | {
        width?: number
        height?: number
        style?: { width?: number | string; height?: number | string }
      }
    | undefined,
): { width: number; height: number } {
  if (!node) return { width: 0, height: 0 }
  const styleW =
    typeof node.style?.width === 'number'
      ? node.style.width
      : parseFloat(String(node.style?.width ?? ''))
  const styleH =
    typeof node.style?.height === 'number'
      ? node.style.height
      : parseFloat(String(node.style?.height ?? ''))
  const width =
    (Number.isFinite(styleW) && styleW > 0 ? styleW : 0) ||
    (typeof node.width === 'number' && node.width > 0 ? node.width : 0)
  const height =
    (Number.isFinite(styleH) && styleH > 0 ? styleH : 0) ||
    (typeof node.height === 'number' && node.height > 0 ? node.height : 0)
  return { width, height }
}

/** Unrotated content box + optional angle (AABB lives on RF width/height when rotated). */
export type FreehandNodeData = {
  points: Points // Local stroke samples in authored space
  initialSize: { width: number; height: number } // Authored box for scale factors
  contentSize?: { width: number; height: number } // Current unrotated size (defaults to RF size when upright)
  rotation?: number // Degrees; 0 = upright
  strokeSize?: number // Authored ink width (flow px); missing → DEFAULT_STROKE_SIZE
  inkKind?: FreehandInkKind // Pencil (default) vs highlighter marker
  strokeColor?: string // Authored fill hex; missing → theme CSS (.freehand-path)
  taperStart?: boolean // Legacy spot-split taper (unused by hole punch)
  taperEnd?: boolean // Legacy spot-split taper (unused by hole punch)
  /** Spot-eraser tip punches in authored local space (same as points); SVG mask holes. */
  eraseHoles?: { x: number; y: number; r: number }[]
}

export type FreehandNodeType = Node<FreehandNodeData, 'freehand'> // RF freehand node

type RotateDrag = {
  startAngle: number // Pointer angle at down (radians)
  startRotation: number // Node angle at down (degrees)
  pivotX: number // Frozen screen pivot x
  pivotY: number // Frozen screen pivot y
  startX: number // Pointer clientX at down
  startY: number // Pointer clientY at down
  didDrag: boolean // Past click-slop?
  startPos: { x: number; y: number } // RF position at gesture start (center-lock base)
  startAabb: { width: number; height: number } // RF box at gesture start
  content: { width: number; height: number } // Frozen unrotated content for this gesture
}

/** Resolve unrotated content size from data + live RF box. */
function resolveContentSize(
  data: FreehandNodeData,
  nodeW: number,
  nodeH: number,
  rotation: number,
): { width: number; height: number } {
  // Upright: RF box IS the content box — follow live NodeResizer dims (ignore stale contentSize)
  if (Math.abs(rotation) <= 0.5) {
    return { width: nodeW, height: nodeH }
  }
  if (data.contentSize && data.contentSize.width > 0 && data.contentSize.height > 0) {
    return data.contentSize // Rotated: RF size is AABB; ink uses explicit content box
  }
  return {
    width: data.initialSize?.width ?? nodeW,
    height: data.initialSize?.height ?? nodeH,
  }
}

export function FreehandNode({
  id,
  data,
  selected,
  dragging,
  ...props
}: NodeProps<FreehandNodeData>) {
  const propWidth = (props as { width?: number }).width // RF v12+; often undefined on v11
  const propHeight = (props as { height?: number }).height
  const { resolvedTheme } = useTheme() // Resizer fill color
  const { setNodes, getNodes } = useReactFlow() // Push AABB + read position for center-lock
  const updateNodeInternals = useUpdateNodeInternals() // Remeasure after size change
  const isThreadConnecting = useIsThreadConnecting() // Hide simulators while connecting unless this drawing is the snap target
  const isNearThreadSnap = useIsNearThreadConnection(id) // Show simulators when the free end is near this drawing
  // Same gate as frames: selected idle, or nearby while a thread end is dragged
  const showIndicators =
    !dragging &&
    ((Boolean(selected) && !isThreadConnecting) || (isThreadConnecting && isNearThreadSnap))
  // Blue adjust ring + circular corner dots (hidden while dragging / connecting)
  const showAdjustFrame = Boolean(selected && !isThreadConnecting && !dragging)
  // Invisible edge connection points — paint stays transparent (threads meet the ink box)
  const connectionPointStyle = (): React.CSSProperties =>
    ({
      opacity: 0,
      backgroundColor: 'transparent',
      border: 'none',
      boxShadow: 'none',
      cursor: 'default',
    }) as React.CSSProperties
  // Same circular corner chrome as frames (size/ring come from CSS + chrome zoom stamp)
  const cornerResizeStyle = {
    background: resolvedTheme === 'dark' ? '#1a1a1a' : '#ffffff', // Contrast against board
    borderRadius: '50%', // Circular corner handles
    boxSizing: 'border-box' as const,
    zIndex: 60, // Above connection indicators so drag hits resize
  }

  // NodeResizer writes style.width/height via dimensions changes — subscribe so ink re-renders
  const storeBox = useStore(
    useCallback(
      (s: { nodeInternals: Map<string, Node> }) => readNodeBox(s.nodeInternals.get(id)),
      [id],
    ),
    (a, b) => a.width === b.width && a.height === b.height,
  )

  const nodeWidth =
    storeBox.width || propWidth || data?.initialSize?.width || 100 // Live RF box (minimap + resizer)
  const nodeHeight =
    storeBox.height || propHeight || data?.initialSize?.height || 100

  const [rotation, setRotation] = useState(() =>
    typeof data?.rotation === 'number' ? data.rotation : 0,
  ) // Live angle for paint + gesture
  const rotationRef = useRef(rotation) // Finish-rotate reads latest without stale closure
  rotationRef.current = rotation

  const contentSize = resolveContentSize(data, nodeWidth, nodeHeight, rotation) // Unrotated stroke box
  const contentSizeRef = useRef(contentSize) // Freeze during rotate AABB math
  contentSizeRef.current = contentSize

  const isRotatingRef = useRef(false) // True while pointer is on the rotate handle
  const rotationDragRef = useRef<RotateDrag | null>(null) // Gesture baseline
  const shellRef = useRef<HTMLDivElement>(null) // Geometry for pivot
  const lastAabbRef = useRef<{ w: number; h: number; rot: number } | null>(null) // Skip redundant setNodes
  // Freeze content + AABB at resize-start so live ticks don't compound scale
  const resizeStartRef = useRef<{
    content: { width: number; height: number }
    aabb: { width: number; height: number }
  } | null>(null)

  // Sync angle from persisted / remote data when not mid-gesture
  useEffect(() => {
    if (isRotatingRef.current) return
    const next = typeof data?.rotation === 'number' ? data.rotation : 0
    if (Math.abs(next - rotationRef.current) > 0.05) setRotation(next)
  }, [data?.rotation])

  // Uniform scale — drawings always keep aspect (NodeResizer keepAspectRatio)
  const scale =
    data.initialSize.width > 0 && data.initialSize.height > 0
      ? Math.min(
          contentSize.width / data.initialSize.width,
          contentSize.height / data.initialSize.height,
        )
      : 1
  const scaleX = scale
  const scaleY = scale

  const points = useMemo(() => {
    if (!data.points || data.points.length === 0) return []
    return data.points.map((point) => [
      point[0] * scaleX,
      point[1] * scaleY,
      point[2] || 1, // Constant pressure — pathOptions thinning is 0 (tip = paint width)
    ]) satisfies Points
  }, [data.points, scaleX, scaleY])

  const pathData = useMemo(() => {
    if (points.length === 0) return ''
    try {
      // Authored width in sample space; multiply by resize scale so thickness tracks the drawing
      const authored = typeof data.strokeSize === 'number' ? data.strokeSize : DEFAULT_STROKE_SIZE
      return (
        pointsToPath(points, 1, authored * scale, {
          start: data.taperStart === true,
          end: data.taperEnd === true,
        }) || ''
      )
    } catch {
      return ''
    }
  }, [points, data.strokeSize, data.taperStart, data.taperEnd, scale])

  // Spot punches in the same viewBox as the ink (mask keeps nonzero fill on the stroke)
  const eraseMaskHoles = useMemo(() => {
    const holes = data.eraseHoles
    if (!holes || holes.length === 0) return []
    return holes
      .map((h) => ({
        cx: h.x * scale,
        cy: h.y * scale,
        r: h.r * scale,
      }))
      .filter((h) => h.r > 0 && Number.isFinite(h.cx) && Number.isFinite(h.cy))
  }, [data.eraseHoles, scale])

  const eraseMaskId = `fh-erase-${id}` // Unique per node for SVG mask url()

  const isContentRotated = Math.abs(rotation) > 0.5 // Match frame threshold for AABB chrome

  /** Write rotation + contentSize (+ optional AABB / position) into RF node data. */
  const patchNode = useCallback(
    (patch: {
      rotation: number
      contentSize: { width: number; height: number }
      aabb?: { width: number; height: number }
      position?: { x: number; y: number }
    }) => {
      setNodes((nodes) =>
        nodes.map((node) => {
          if (node.id !== id) return node
          const nextData: FreehandNodeData = {
            ...(node.data as FreehandNodeData),
            rotation: patch.rotation,
            contentSize: patch.contentSize,
          }
          const next: typeof node = {
            ...node,
            data: nextData,
          }
          if (patch.aabb) {
            next.width = patch.aabb.width
            next.height = patch.aabb.height
            next.style = {
              ...node.style,
              width: patch.aabb.width,
              height: patch.aabb.height,
            }
          }
          if (patch.position) next.position = patch.position
          return next
        }),
      )
      updateNodeInternals(id)
    },
    [id, setNodes, updateNodeInternals],
  )

  /** Grow/shrink upright AABB around content; keep visual center fixed (no snap mates). */
  const pushAabb = useCallback(
    (
      rot: number,
      content: { width: number; height: number },
      origin?: {
        startPos: { x: number; y: number }
        startAabb: { width: number; height: number }
      },
    ): { aabb: { width: number; height: number }; position: { x: number; y: number } } => {
      const aabb =
        Math.abs(rot) > 0.5
          ? rotatedRectAabbSize(content.width, content.height, rot)
          : { width: content.width, height: content.height }
      const boxW = Math.round(aabb.width)
      const boxH = Math.round(aabb.height)
      const node = getNodes().find((n) => n.id === id)
      const prevW = origin?.startAabb.width ?? lastAabbRef.current?.w ?? (typeof node?.width === 'number' ? node.width : nodeWidth)
      const prevH = origin?.startAabb.height ?? lastAabbRef.current?.h ?? (typeof node?.height === 'number' ? node.height : nodeHeight)
      const pos = origin?.startPos ?? node?.position ?? { x: 0, y: 0 }
      // Center-lock from a frozen origin so live drag ticks don't accumulate drift
      const nextPos = {
        x: pos.x - (boxW - prevW) / 2,
        y: pos.y - (boxH - prevH) / 2,
      }
      lastAabbRef.current = { w: boxW, h: boxH, rot }
      patchNode({
        rotation: rot,
        contentSize: content,
        aabb: { width: boxW, height: boxH },
        position: nextPos,
      })
      return { aabb: { width: boxW, height: boxH }, position: nextPos }
    },
    [getNodes, id, nodeWidth, nodeHeight, patchNode],
  )

  /** Persist data + geometry to canvas_nodes (fire-and-forget). */
  const persistRotation = useCallback(
    async (
      nextRotation: number,
      content: { width: number; height: number },
      aabb: { width: number; height: number },
      position: { x: number; y: number },
    ) => {
      try {
        const supabase = createClient()
        const {
          data: { user },
        } = await supabase.auth.getUser()
        if (!user) return
        const live = getNodes().find((n) => n.id === id)
        const baseData = (live?.data as FreehandNodeData) || data
        const { error } = await supabase
          .from('canvas_nodes')
          .update({
            width: aabb.width,
            height: aabb.height,
            position_x: position.x,
            position_y: position.y,
            data: {
              ...baseData,
              rotation: nextRotation,
              contentSize: content,
            },
          })
          .eq('id', id)
          .eq('user_id', user.id)
        if (error) console.error('🎨 Error saving freehand rotation:', error)
      } catch (err) {
        console.error('🎨 Error saving freehand rotation:', err)
      }
    },
    [data, getNodes, id],
  )

  const finishRotation = useCallback(
    (next: number) => {
      const drag = rotationDragRef.current
      const content = drag?.content ?? contentSizeRef.current
      setRotation(next)
      const origin = drag
        ? { startPos: drag.startPos, startAabb: drag.startAabb }
        : undefined
      const pushed = pushAabb(next, content, origin)
      void persistRotation(next, content, pushed.aabb, pushed.position)
    },
    [persistRotation, pushAabb],
  )

  const handleRotatePointerDown = useCallback(
    (e: React.PointerEvent<HTMLButtonElement>) => {
      e.stopPropagation() // Don't start RF node drag
      e.preventDefault()
      if (!shellRef.current) return
      const rect = shellRef.current.getBoundingClientRect() // Screen AABB
      const cx = rect.left + rect.width / 2
      const cy = rect.top + rect.height / 2
      const content = { width: contentSize.width, height: contentSize.height }
      contentSizeRef.current = content
      // Seed contentSize so later AABB math has an explicit unrotated box
      if (!data.contentSize) {
        patchNode({ rotation, contentSize: content })
      }
      const node = getNodes().find((n) => n.id === id)
      const startAabb = {
        width: typeof node?.width === 'number' ? node.width : nodeWidth,
        height: typeof node?.height === 'number' ? node.height : nodeHeight,
      }
      isRotatingRef.current = true
      rotationDragRef.current = {
        startAngle: Math.atan2(e.clientY - cy, e.clientX - cx),
        startRotation: rotation,
        pivotX: cx,
        pivotY: cy,
        startX: e.clientX,
        startY: e.clientY,
        didDrag: false,
        startPos: node?.position ? { ...node.position } : { x: 0, y: 0 },
        startAabb,
        content,
      }
      e.currentTarget.setPointerCapture(e.pointerId)
    },
    [
      contentSize.height,
      contentSize.width,
      data.contentSize,
      getNodes,
      id,
      nodeHeight,
      nodeWidth,
      patchNode,
      rotation,
    ],
  )

  const handleRotatePointerMove = useCallback(
    (e: React.PointerEvent<HTMLButtonElement>) => {
      if (!isRotatingRef.current || !rotationDragRef.current) return
      const drag = rotationDragRef.current
      const dx = e.clientX - drag.startX
      const dy = e.clientY - drag.startY
      if (!drag.didDrag && dx * dx + dy * dy > ROTATE_CLICK_SLOP_PX * ROTATE_CLICK_SLOP_PX) {
        drag.didDrag = true
      }
      if (!drag.didDrag) return
      const angle = Math.atan2(e.clientY - drag.pivotY, e.clientX - drag.pivotX)
      const deltaDeg = ((angle - drag.startAngle) * 180) / Math.PI
      let next = drag.startRotation + deltaDeg
      if (e.shiftKey) next = Math.round(next / 15) * 15 // Shift → 15° snaps (match frames)
      setRotation(next)
      pushAabb(next, drag.content, {
        startPos: drag.startPos,
        startAabb: drag.startAabb,
      })
    },
    [pushAabb],
  )

  const handleRotatePointerUp = useCallback(
    (e: React.PointerEvent<HTMLButtonElement>) => {
      if (!isRotatingRef.current) return
      const didDrag = rotationDragRef.current?.didDrag === true
      const liveAngle = rotationRef.current
      try {
        e.currentTarget.releasePointerCapture(e.pointerId)
      } catch {
        /* already released */
      }
      if (!didDrag) {
        finishRotation(0) // Click = reset upright (uses drag origin before clear)
        isRotatingRef.current = false
        rotationDragRef.current = null
        return
      }
      finishRotation(liveAngle)
      isRotatingRef.current = false
      rotationDragRef.current = null
    },
    [finishRotation],
  )

  /** Snapshot content + AABB before NodeResizer mutates RF width/height. */
  const handleResizeStart = useCallback(() => {
    if (isRotatingRef.current) return
    resizeStartRef.current = {
      content: { width: contentSizeRef.current.width, height: contentSizeRef.current.height },
      aabb: { width: nodeWidth, height: nodeHeight },
    }
  }, [nodeHeight, nodeWidth])

  /** Live resize: upright follows RF dims via resolveContentSize; rotated scales content from AABB. */
  const handleResize = useCallback(
    (_e: unknown, params: { width: number; height: number }) => {
      if (isRotatingRef.current) return
      const rot = rotationRef.current
      if (Math.abs(rot) <= 0.5) {
        contentSizeRef.current = { width: params.width, height: params.height }
        return // Ink scale tracks nodeWidth/nodeHeight on the next render
      }
      const start = resizeStartRef.current
      if (!start) return
      const sx = start.aabb.width > 0 ? params.width / start.aabb.width : 1
      const sy = start.aabb.height > 0 ? params.height / start.aabb.height : 1
      const s = (sx + sy) / 2 // keepAspectRatio — average is stable if one axis lags a frame
      const content = {
        width: Math.max(1, start.content.width * s),
        height: Math.max(1, start.content.height * s),
      }
      contentSizeRef.current = content
      // Push contentSize so the stroke scales during drag (RF already owns AABB width/height)
      setNodes((nodes) =>
        nodes.map((node) => {
          if (node.id !== id) return node
          return {
            ...node,
            data: {
              ...(node.data as FreehandNodeData),
              contentSize: content,
              rotation: rot,
            },
          }
        }),
      )
    },
    [id, setNodes],
  )

  /** After RF resize: upright → content = box; rotated → scale content from AABB ratio. */
  const handleResizeEnd = useCallback(
    (_e: unknown, params: { width: number; height: number }) => {
      if (isRotatingRef.current) return
      const rot = rotationRef.current
      const start = resizeStartRef.current
      resizeStartRef.current = null
      if (Math.abs(rot) <= 0.5) {
        const content = { width: params.width, height: params.height }
        contentSizeRef.current = content
        lastAabbRef.current = { w: params.width, h: params.height, rot: 0 }
        patchNode({ rotation: 0, contentSize: content })
        const live = getNodes().find((n) => n.id === id)
        if (live) {
          void persistRotation(0, content, params, live.position)
        }
        return
      }
      // Prefer start→end ratio so we don't re-derive from a mid-drag contentSize
      const baseContent = start?.content ?? contentSizeRef.current
      const baseAabb =
        start?.aabb ??
        rotatedRectAabbSize(baseContent.width, baseContent.height, rot)
      const sx = baseAabb.width > 0 ? params.width / baseAabb.width : 1
      const sy = baseAabb.height > 0 ? params.height / baseAabb.height : 1
      const s = (sx + sy) / 2
      const content = {
        width: Math.max(1, baseContent.width * s),
        height: Math.max(1, baseContent.height * s),
      }
      contentSizeRef.current = content
      const pushed = pushAabb(rot, content)
      if (pushed) void persistRotation(rot, content, pushed.aabb, pushed.position)
    },
    [getNodes, id, patchNode, persistRotation, pushAabb],
  )

  return (
    <div
      ref={shellRef}
      data-panel-container="true" // Host for frame-style connection-indicator CSS + chrome zoom stamp
      className="relative h-full w-full"
      style={{ width: nodeWidth, height: nodeHeight }}
    >
      <LiveFrameChromeZoom selected={selected} panelRef={shellRef} />
      {/* Selected: square blue ring + circular corner dots (same chrome as frames) */}
      {showAdjustFrame && (
        <>
          <div
            aria-hidden
            data-tt-adjust-ring
            className="pointer-events-none absolute z-[19]"
            style={{
              inset: 0, // Full drawing AABB — corner handles sit on this box
              borderRadius: 0,
              boxShadow: 'inset 0 0 0 var(--tt-frame-line-w, 1.4px) #3b82f6', // Screen-constant stroke
            }}
          />
          {RESIZE_EDGES.map((position) => (
            <NodeResizeControl
              key={`line-${position}`}
              position={position}
              variant={ResizeControlVariant.Line} // Hit only — ring paints the stroke
              className="nodrag nopan tt-frame-resize-line tt-frame-resize-line-hit"
              minWidth={FREEHAND_RESIZE_MIN}
              minHeight={FREEHAND_RESIZE_MIN}
              keepAspectRatio // Ink + box stay matched
              onResizeStart={handleResizeStart}
              onResize={handleResize}
              onResizeEnd={handleResizeEnd}
            />
          ))}
          {RESIZE_CORNERS.map((position) => (
            <NodeResizeControl
              key={position}
              position={position}
              className="nodrag nopan"
              style={cornerResizeStyle}
              minWidth={FREEHAND_RESIZE_MIN}
              minHeight={FREEHAND_RESIZE_MIN}
              keepAspectRatio
              onResizeStart={handleResizeStart}
              onResize={handleResize}
              onResizeEnd={handleResizeEnd}
            />
          ))}
        </>
      )}
      {/* Content shell — centered + rotated inside upright AABB (same pattern as frames) */}
      <div
        className="absolute"
        style={
          isContentRotated
            ? {
                width: contentSize.width,
                height: contentSize.height,
                left: '50%',
                top: '50%',
                transform: `translate(-50%, -50%) rotate(${rotation}deg)`,
                transformOrigin: 'center center',
              }
            : {
                inset: 0,
                width: '100%',
                height: '100%',
              }
        }
      >
        <svg
          width={contentSize.width}
          height={contentSize.height}
          viewBox={`0 0 ${contentSize.width} ${contentSize.height}`}
          style={{
            pointerEvents: selected ? 'auto' : 'none',
            display: 'block',
            width: '100%',
            height: '100%',
            overflow: 'visible', // Thickness tweaks can paint slightly past the authored box
          }}
        >
          {eraseMaskHoles.length > 0 ? (
            <defs>
              {/* White = keep ink; black circles = tip-sized punches (not centerline splits) */}
              <mask id={eraseMaskId} maskUnits="userSpaceOnUse">
                <rect
                  x={-contentSize.width}
                  y={-contentSize.height}
                  width={contentSize.width * 3}
                  height={contentSize.height * 3}
                  fill="#fff"
                />
                {eraseMaskHoles.map((h, i) => (
                  <circle key={i} cx={h.cx} cy={h.cy} r={h.r} fill="#000" />
                ))}
              </mask>
            </defs>
          ) : null}
          {pathData ? (
            <path
              className={data.strokeColor || data.inkKind === 'highlighter' ? undefined : 'freehand-path'} // Legacy ink keeps theme CSS
              style={{
                pointerEvents: 'visiblePainted',
                cursor: 'pointer',
                stroke: 'none',
                ...(eraseMaskHoles.length > 0 ? { mask: `url(#${eraseMaskId})` } : {}),
                ...(data.strokeColor
                  ? { fill: data.strokeColor } // Authored swatch (pencil or highlighter)
                  : {}),
                ...(data.inkKind === 'highlighter'
                  ? {
                      opacity: HIGHLIGHTER_OPACITY, // Translucent marker
                      mixBlendMode: 'multiply' as const, // Classic highlighter over light boards
                    }
                  : {}),
              }}
              d={pathData}
            />
          ) : (
            <circle
              cx={contentSize.width / 2}
              cy={contentSize.height / 2}
              r={5}
              fill="#ff0000"
            />
          )}
        </svg>
      </div>

      {/* Rotate chrome — same [data-frame-chrome] + ui-scale as frames */}
      {selected && !dragging && (
        <div
          data-frame-chrome
          className="nodrag nopan absolute z-[25] flex items-center gap-0.5"
          style={{
            left: 0,
            top: '100%',
            // 2× indicator outset — same air as frame rotate under the bottom connection point
            marginTop: `calc(${2 * INDICATOR_OUTSET}px * var(--tt-frame-ui-scale, 1.4))`,
          }}
          onMouseDown={(e) => e.stopPropagation()}
        >
          <button
            type="button"
            className="flex h-5 w-5 items-center justify-center rounded-full text-gray-700 hover:bg-gray-100 dark:text-gray-200 dark:hover:bg-gray-800"
            style={{ cursor: 'grab' }}
            title="Drag to rotate · click to reset"
            aria-label="Rotate — drag to turn, click to reset"
            onPointerDown={handleRotatePointerDown}
            onPointerMove={handleRotatePointerMove}
            onPointerUp={handleRotatePointerUp}
            onPointerCancel={handleRotatePointerUp}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Local 10px → ~14px on screen after ui-scale (matches frame rotate) */}
            <RotateCw className="h-2.5 w-2.5 pointer-events-none" />
          </button>
        </div>
      )}

      {/* Simulated connection points — DOM only, outset from adjust box (same CSS as frames) */}
      {showIndicators &&
        CONNECTION_SIDES.map((side) => (
          <ConnectionIndicator
            key={`indicator-${side}`}
            side={side}
            className={cn(
              'nodrag nopan absolute z-[30] rounded-full bg-blue-500',
              isThreadConnecting
                ? 'pointer-events-none' // Visual snap target only — don't steal hit from edge Handles
                : 'cursor-crosshair hover:bg-blue-600',
            )}
          />
        ))}

      {/* Invisible edge connection points — always mounted so settled threads can attach */}
      {CONNECTION_SIDES.map((side) => {
        const position =
          side === 'left'
            ? Position.Left
            : side === 'right'
              ? Position.Right
              : side === 'top'
                ? Position.Top
                : Position.Bottom
        return (
          <Fragment key={`cp-${side}`}>
            <Handle
              type="target"
              position={position}
              id={side}
              isConnectable
              isConnectableStart={false}
              isConnectableEnd
              className="handle-dot tt-connection-point"
              style={connectionPointStyle()}
            />
            <Handle
              type="source"
              position={position}
              id={side}
              isConnectable
              isConnectableStart={false} // Drag starts from ConnectionIndicator (DOM), not this Handle
              isConnectableEnd
              className="handle-dot tt-connection-point"
              style={connectionPointStyle()}
            />
          </Fragment>
        )
      })}
    </div>
  )
}
