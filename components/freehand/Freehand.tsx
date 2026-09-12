// Freehand drawing overlay component for React Flow
// Handles pointer events to capture drawing strokes and create freehand nodes
import { useEffect, useRef, useState, type PointerEvent } from 'react'; // React hooks for state and refs
import { useReactFlow, useStore, useStoreApi, type Edge } from 'reactflow'; // RF hooks — store panBy matches thread connect; useStore for live zoom tip
import { createClient } from '@/lib/supabase/client'; // Supabase client for database operations
import { generateUUID } from '@/lib/utils'; // UUID generation utility (compatible with all browsers)
import { PANE_CLICK_SLOP_PX, PANE_TAP_SLOP_PX } from '@/lib/pane-click-slop'; // Click vs stroke — same slop as empty-board select
import { useReactFlowContext } from '@/components/react-flow-context'; // Disarm pencil after click-select

import { DEFAULT_STROKE_SIZE, DRAW_TIP_DIAMETER_PX, pointsToPath } from './path' // Path generation + fixed tip
import {
  HIGHLIGHTER_OPACITY, // Marker translucency for live preview
  resolveStrokeHex, // Swatch → fill hex for pencil / highlighter
  resolveStrokeSizeFromZoom, // Tip ÷ zoom → flow stroke width
  resolveTipDiameterPx, // Screen circle size (highlighter wider)
  type FreehandInkKind, // Persisted ink kind on the node
} from './ink'
import type { Points } from './types' // Points type definition
import type { FreehandNodeType } from './FreehandNode' // Freehand node type

/** Same inset as RF `calcAutoPan` / thread connect (~35px from the pane edge). */
const EDGE_PAN_INSET = 35
/** Max px/frame at the hard edge; interior of the zone ramps down from this (thread connect uses 20). */
const EDGE_PAN_SPEED_MAX = 4
/** RF `calcAutoPanVelocity` clamps penetration depth to this before normalizing. */
const EDGE_PAN_DEPTH_CAP = 50

/**
 * Signed pan delta for one axis — same curve as RF `calcAutoPanVelocity` × maxSpeed.
 * Just inside the inset → crawl; flush against / past the rim → full EDGE_PAN_SPEED_MAX.
 */
function edgePanAxisDelta(value: number, min: number, max: number, maxSpeed: number): number {
  if (value < min) {
    const t = Math.min(Math.max(Math.abs(value - min), 1), EDGE_PAN_DEPTH_CAP) / EDGE_PAN_DEPTH_CAP
    return t * maxSpeed // Reveal content past the near edge
  }
  if (value > max) {
    const t = Math.min(Math.max(Math.abs(value - max), 1), EDGE_PAN_DEPTH_CAP) / EDGE_PAN_DEPTH_CAP
    return -t * maxSpeed // Reveal content past the far edge
  }
  return 0 // Interior — no pan on this axis
}

/**
 * Build a freehand node payload from flow-space samples (already converted per pointer event).
 * Must not re-run screen→flow at commit — mid-stroke edge pan would remap earlier points wrong.
 */
function processFlowPoints(points: Points, strokeSize: number = DEFAULT_STROKE_SIZE) {
  let x1 = Infinity // Minimum flow x
  let y1 = Infinity // Minimum flow y
  let x2 = -Infinity // Maximum flow x
  let y2 = -Infinity // Maximum flow y

  // Clone so normalize mutates local tuples only (pointRef stays absolute flow until clear)
  const flowPoints: Points = points.map(([x, y, p]) => [x, y, p])

  for (const [x, y] of flowPoints) {
    x1 = Math.min(x1, x) // Expand bbox left
    y1 = Math.min(y1, y) // Expand bbox top
    x2 = Math.max(x2, x) // Expand bbox right
    y2 = Math.max(y2, y) // Expand bbox bottom
  }

  // Pad bbox by half stroke so ink outline isn’t clipped at node edges
  const thickness = strokeSize * 0.5
  x1 -= thickness
  y1 -= thickness
  x2 += thickness
  y2 += thickness

  // Normalize to (0,0) relative to padded bbox for scale-friendly node data
  for (const flowPoint of flowPoints) {
    flowPoint[0] -= x1
    flowPoint[1] -= y1
  }
  let width = x2 - x1
  let height = y2 - y1

  // Ensure minimum size (at least stroke thickness * 2)
  const minSize = strokeSize * 2
  if (width < minSize) {
    const centerX = (x1 + x2) / 2
    x1 = centerX - minSize / 2
    x2 = centerX + minSize / 2
    width = minSize
  }
  if (height < minSize) {
    const centerY = (y1 + y2) / 2
    y1 = centerY - minSize / 2
    y2 = centerY + minSize / 2
    height = minSize
  }

  return {
    position: { x: x1, y: y1 }, // Top-left of padded bbox in flow space
    width,
    height,
    data: { points: flowPoints, initialSize: { width, height }, strokeSize },
  }
}

// Store failed save in localStorage for retry later
// node: Freehand node that failed to save
// conversationId: Conversation/board ID
function storeFailedSave(node: FreehandNodeType, conversationId: string) {
  try {
    const key = `nodnotes-failed-canvas-saves-${conversationId}`
    const failed = JSON.parse(localStorage.getItem(key) || '[]')
    failed.push({
      node,
      conversationId,
      timestamp: Date.now(),
    })
    // Keep only last 50 failed saves to avoid localStorage bloat
    const trimmed = failed.slice(-50)
    localStorage.setItem(key, JSON.stringify(trimmed))
    console.log('🎨 Stored failed save for retry:', node.id)
  } catch (error) {
    console.error('🎨 Error storing failed save:', error)
  }
}

// Remove successful save from failed saves list
// nodeId: ID of the node that was successfully saved
function removeFailedSave(nodeId: string) {
  try {
    // Try to find and remove from any conversation's failed saves
    const keys = Object.keys(localStorage).filter(key => key.startsWith('nodnotes-failed-canvas-saves-'))
    for (const key of keys) {
      const failed = JSON.parse(localStorage.getItem(key) || '[]')
      const filtered = failed.filter((item: any) => item.node.id !== nodeId)
      if (filtered.length !== failed.length) {
        localStorage.setItem(key, JSON.stringify(filtered))
        console.log('🎨 Removed successful save from failed list:', nodeId)
      }
    }
  } catch (error) {
    console.error('🎨 Error removing failed save:', error)
  }
}

// Retry failed saves for a conversation
// conversationId: Conversation/board ID to retry saves for
export async function retryFailedSaves(conversationId: string) {
  try {
    const key = `nodnotes-failed-canvas-saves-${conversationId}`
    const failed = JSON.parse(localStorage.getItem(key) || '[]')
    if (failed.length === 0) return

    console.log(`🎨 Retrying ${failed.length} failed canvas saves for conversation:`, conversationId)
    
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    
    if (!user) {
      console.warn('🎨 Cannot retry saves: user not authenticated')
      return
    }

    const successful: string[] = []
    const stillFailed: any[] = []

    for (const item of failed) {
      try {
        const { error } = await supabase
          .from('canvas_nodes')
          .insert({
            id: item.node.id,
            conversation_id: item.conversationId,
            user_id: user.id,
            node_type: 'freehand',
            position_x: item.node.position.x,
            position_y: item.node.position.y,
            width: item.node.width,
            height: item.node.height,
            data: item.node.data,
          })

        if (error) {
          console.error('🎨 Still failed to save:', item.node.id, error)
          stillFailed.push(item)
        } else {
          console.log('🎨 ✅ Retry successful:', item.node.id)
          successful.push(item.node.id)
        }
      } catch (error) {
        console.error('🎨 Error retrying save:', item.node.id, error)
        stillFailed.push(item)
      }
    }

    // Update localStorage with remaining failed saves
    if (stillFailed.length > 0) {
      localStorage.setItem(key, JSON.stringify(stillFailed))
    } else {
      localStorage.removeItem(key)
    }

    // Remove successful saves from all failed lists
    successful.forEach(id => removeFailedSave(id))

    console.log(`🎨 Retry complete: ${successful.length} successful, ${stillFailed.length} still failed`)
  } catch (error) {
    console.error('🎨 Error retrying failed saves:', error)
  }
}

// Freehand component - overlay that captures drawing strokes
// Creates freehand nodes when user draws on the canvas
// onBeforeCreate: Optional callback to trigger before creating a node (for undo/redo snapshot)
export function Freehand({ conversationId, onBeforeCreate }: { conversationId?: string; onBeforeCreate?: () => void }) {
  // Get React Flow instance functions for coordinate conversion and node management
  const { screenToFlowPosition, flowToScreenPosition, setNodes, setEdges } = useReactFlow<
    FreehandNodeType,
    Edge
  >();
  const store = useStoreApi() // panBy lives on the RF store (same as thread connect auto-pan)
  const { setDrawTool, setIsDrawing, drawTool, drawTipSize, pencilColor, highlighterColor } =
    useReactFlowContext() // Click-select disarms ink; tip + color from Draw bar
  const inkKind: FreehandInkKind = drawTool === 'highlighter' ? 'highlighter' : 'pencil' // Armed tool → stroke kind
  const inkId = inkKind === 'highlighter' ? highlighterColor : pencilColor // Per-tool swatch
  const strokeColor = resolveStrokeHex(inkKind, inkId) // Persisted + preview fill
  const pointRef = useRef<Points>([]) // Absolute flow-space samples for the active stroke
  const [points, setPoints] = useState<Points>([]) // Overlay-local preview (reprojected from flow)
  const overlayRef = useRef<HTMLDivElement>(null) // Hit-test peeks under this layer
  const startRef = useRef<{ x: number; y: number; pointerType: string } | null>(null) // Gesture origin for click-vs-stroke
  const pointerRef = useRef({ x: 0, y: 0, pressure: 0.5 }) // Latest client pointer for edge-pan ticks
  const strokeActiveRef = useRef(false) // True between pointerdown and up/cancel
  const autoPanRafRef = useRef(0) // Active edge-pan rAF id (0 = stopped)
  const [cursor, setCursor] = useState<{ x: number; y: number } | null>(null) // Brush-tip circle (same pattern as spot eraser)
  const zoom = useStore((s) => s.transform[2] || 1) // Live zoom — thickness = tip ÷ zoom (like eraser)
  const tipPx = drawTipSize || DRAW_TIP_DIAMETER_PX // Thickness bar value (screen px)
  const brushDiameterPx = resolveTipDiameterPx(inkKind, tipPx) // Screen tip (highlighter wider)
  const strokeSize = resolveStrokeSizeFromZoom(inkKind, tipPx, zoom) // Flow width for commit + getStroke

  /** RF pane box used for edge inset + overlay-local preview math. */
  function flowPaneRect(): DOMRect | null {
    const el = document.querySelector('.react-flow') as HTMLElement | null
    if (!el) return null
    return el.getBoundingClientRect()
  }

  /** Overlay-local point under the client pointer (RF pane origin). */
  function containerPoint(clientX: number, clientY: number) {
    const rect = flowPaneRect()
    if (!rect) return null
    return { x: clientX - rect.left, y: clientY - rect.top }
  }

  /** Stop the connect-style edge auto-pan loop. */
  function stopEdgePan() {
    if (autoPanRafRef.current) {
      cancelAnimationFrame(autoPanRafRef.current)
      autoPanRafRef.current = 0
    }
  }

  /** Project flow samples into overlay-local coords so preview tracks pan/zoom. */
  function previewFromFlow(flowPts: Points): Points {
    const rect = flowPaneRect()
    if (!rect) return []
    return flowPts.map(([fx, fy, p]) => {
      const s = flowToScreenPosition({ x: fx, y: fy }) // Client space after current viewport
      return [s.x - rect.left, s.y - rect.top, p] // Overlay is positioned on the RF pane
    })
  }

  /** Convert one client sample to flow, densify toward the tip so paint fills the circle. */
  function appendFlowSample(clientX: number, clientY: number, _pressure: number) {
    const { x, y } = screenToFlowPosition({ x: clientX, y: clientY }) // Capture under current viewport
    const pressure = 1 // Constant — thinning is off; tip diameter is the paint width
    const prev = pointRef.current
    const next: Points = [...prev]
    if (prev.length > 0) {
      // Stamp along the segment so fast moves don’t leave gaps smaller than the tip
      const [lx, ly] = prev[prev.length - 1]
      const dx = x - lx
      const dy = y - ly
      const dist = Math.hypot(dx, dy)
      const step = Math.max(strokeSize * 0.35, 0.5) // ~3 stamps across the tip diameter
      if (dist > step) {
        const n = Math.floor(dist / step)
        for (let i = 1; i < n; i++) {
          const t = i / n
          next.push([lx + dx * t, ly + dy * t, pressure])
        }
      }
    }
    next.push([x, y, pressure])
    pointRef.current = next
    setPoints(previewFromFlow(next)) // Reproject all points so prior ink moves with the board
  }

  /** Match RF calcAutoPan: proximity-scaled speed; near left/top → +panBy; near right/bottom → −. */
  function edgePanTick() {
    if (!strokeActiveRef.current) {
      autoPanRafRef.current = 0
      return
    }
    const { panBy } = store.getState()
    const bounds = flowPaneRect()
    if (bounds && panBy) {
      const { x: cx, y: cy, pressure } = pointerRef.current
      const lx = cx - bounds.left // Pointer X inside the pane
      const ly = cy - bounds.top // Pointer Y inside the pane
      const dx = edgePanAxisDelta(lx, EDGE_PAN_INSET, bounds.width - EDGE_PAN_INSET, EDGE_PAN_SPEED_MAX)
      const dy = edgePanAxisDelta(ly, EDGE_PAN_INSET, bounds.height - EDGE_PAN_INSET, EDGE_PAN_SPEED_MAX)
      if (dx || dy) {
        panBy({ x: dx, y: dy }) // Reveal board past the hugged edge
        // Same screen tip → new flow point after pan (stroke continues into revealed space)
        appendFlowSample(cx, cy, pressure)
      }
    }
    autoPanRafRef.current = requestAnimationFrame(edgePanTick)
  }

  /** Kick off edge pan once per stroke (idempotent). */
  function startEdgePan() {
    if (autoPanRafRef.current) return
    autoPanRafRef.current = requestAnimationFrame(edgePanTick)
  }

  /** Clear in-progress ink without creating a node. */
  function clearStroke() {
    stopEdgePan() // Don't pan after the gesture ends
    strokeActiveRef.current = false
    setPoints([]) // Drop preview path
    pointRef.current = [] // Drop capture samples
    startRef.current = null // Next down starts fresh
  }

  // Drop edge-pan rAF if the overlay unmounts mid-stroke (tool disarm / route change)
  useEffect(() => () => stopEdgePan(), [])

  /**
   * Click (no drag): select the RF node under the pointer instead of leaving a ink blot.
   * Hitting a node also disarms pencil so resize/rotate/drag work; empty click only clears selection.
   */
  function selectUnderPoint(clientX: number, clientY: number) {
    const overlay = overlayRef.current // Full-board capture layer
    const prev = overlay?.style.pointerEvents // Restore after peek
    if (overlay) overlay.style.pointerEvents = 'none' // Let elementFromPoint see frames / ink under us
    const hit = document.elementFromPoint(clientX, clientY) // Topmost element under the click
    if (overlay) overlay.style.pointerEvents = prev ?? '' // Resume capture for the next stroke
    const nodeEl =
      hit instanceof Element ? (hit.closest('.react-flow__node') as HTMLElement | null) : null // RF node wrapper
    const nodeId = nodeEl?.getAttribute('data-id') ?? null // null = empty board click
    setNodes((nodes) => nodes.map((n) => ({ ...n, selected: n.id === nodeId }))) // Single-select / clear
    setEdges((edges) => edges.map((e) => ({ ...e, selected: false }))) // Drop thread selection with the click
    if (nodeId) {
      setDrawTool(null) // Leave Draw tool so the overlay unmounts
      setIsDrawing(false) // Stop freehand capture — selected chrome needs the pointer
    }
  }

  // Handle pointer down - start a new drawing stroke
  function handlePointerDown(e: PointerEvent<HTMLDivElement>) {
    if (e.button !== 0) return // Primary only — right-click stays for board/frame menus
    ;(e.target as HTMLDivElement).setPointerCapture(e.pointerId) // Capture pointer for this element
    startRef.current = { x: e.clientX, y: e.clientY, pointerType: e.pointerType } // Remember origin for click slop
    if (!flowPaneRect()) return // Need the RF pane for flow math
    setCursor(containerPoint(e.clientX, e.clientY)) // Show brush tip immediately
    strokeActiveRef.current = true // Arm edge-pan + sample gating
    pointerRef.current = { x: e.clientX, y: e.clientY, pressure: e.pressure } // Seed auto-pan pointer
    pointRef.current = [] // Fresh stroke
    appendFlowSample(e.clientX, e.clientY, e.pressure) // First flow sample + preview
    startEdgePan() // Same continuous edge check as dragging a thread
  }

  // Handle pointer move — always track brush tip; sample only while drawing
  function handlePointerMove(e: PointerEvent) {
    setCursor(containerPoint(e.clientX, e.clientY))
    if (e.buttons !== 1) return // Only ink if left mouse button is pressed
    if (!strokeActiveRef.current || pointRef.current.length === 0) return // Stroke not started
    pointerRef.current = { x: e.clientX, y: e.clientY, pressure: e.pressure } // Keep edge-pan in sync
    appendFlowSample(e.clientX, e.clientY, e.pressure) // Flow sample under current viewport
  }

  /** Hide tip when the pointer leaves the overlay (unless mid-stroke with capture). */
  function handlePointerLeave() {
    if (!strokeActiveRef.current) setCursor(null)
  }

  // Handle pointer up - finish stroke and create freehand node (or click-select)
  function handlePointerUp(e: PointerEvent) {
    try {
      ;(e.target as HTMLDivElement).releasePointerCapture(e.pointerId) // Release before hit-test peek
    } catch {
      // Already released
    }

    stopEdgePan() // Halt pan before commit / click-select
    strokeActiveRef.current = false

    // Get points from ref (not state, as state might be stale)
    const finalPoints = pointRef.current
    const start = startRef.current
    if (finalPoints.length === 0 || !start) {
      // No points collected, clear and return
      clearStroke()
      return
    }

    // Click / tap within slop → select under the pointer; do not mint a blot
    const slop = start.pointerType === 'mouse' ? PANE_CLICK_SLOP_PX : PANE_TAP_SLOP_PX
    const dx = e.clientX - start.x
    const dy = e.clientY - start.y
    if (dx * dx + dy * dy <= slop * slop) {
      clearStroke() // Drop the preview sample(s)
      selectUnderPoint(e.clientX, e.clientY) // Select frame/ink or clear selection
      return
    }

    // Process already-flow samples (bbox padding matches the armed thickness)
    const nodeData = processFlowPoints(finalPoints, strokeSize)
    
    // Generate unique node ID (compatible with all browsers including older Safari)
    const nodeId = generateUUID()
    
    // Debug: Log node creation
    console.log('🎨 Creating freehand node:', {
      id: nodeId,
      pointCount: finalPoints.length,
      inkKind,
      strokeColor,
      nodeData: {
        position: nodeData.position,
        width: nodeData.width,
        height: nodeData.height,
        pointsCount: nodeData.data.points.length,
      }
    })

    // Take snapshot before creating node for undo/redo support
    if (onBeforeCreate) onBeforeCreate()

    // Create new freehand node from collected points
    // Note: reactflow v11 requires width/height in style, not as direct properties
    // v12+ (@xyflow/react) uses direct properties but we're on v11
    const newNode: FreehandNodeType = {
      id: nodeId, // Generate unique node ID (compatible with all browsers)
      type: 'freehand', // Set node type
      position: nodeData.position, // Node position in flow coordinates
      width: nodeData.width, // Node width (for v12+ compatibility)
      height: nodeData.height, // Node height (for v12+ compatibility)
      style: { // Style object for v11 - required for node dimensions
        width: nodeData.width,
        height: nodeData.height,
      },
      data: {
        ...nodeData.data, // Points, initialSize, strokeSize
        inkKind, // Pencil vs highlighter (drives opacity / blend)
        strokeColor, // Authored fill hex from the Draw swatch
      },
        // resizable: true, // Removed - not a valid Node property // Enable resizing for this node
      selectable: true, // Enable selection
      draggable: true, // Enable dragging
    };
    
    console.log('🎨 Created freehand node:', {
      id: newNode.id,
      position: newNode.position,
      width: newNode.width,
      height: newNode.height,
      pointsCount: newNode.data.points.length,
      initialSize: newNode.data.initialSize,
    })

    setNodes((nodes: any[]) => {
      const updatedNodes = [...nodes, newNode]
      console.log('🎨 Added freehand node, total nodes:', updatedNodes.length)
      return updatedNodes
    }); // Add new node to React Flow
    
    // Save freehand node to database if conversationId is available
    if (conversationId) {
      const saveNodeToDatabase = async (retryCount = 0, maxRetries = 3) => {
        try {
          const supabase = createClient() // Create Supabase client
          const { data: { user }, error: authError } = await supabase.auth.getUser() // Get current user
          
          if (authError) {
            console.error('🎨 Auth error when saving freehand node:', authError)
            // Store failed save for retry later
            storeFailedSave(newNode, conversationId)
            return
          }
          
          if (!user) {
            console.warn('🎨 Cannot save freehand node: user not authenticated')
            // Store failed save for retry later
            storeFailedSave(newNode, conversationId)
            return
          }

          // Save node to canvas_nodes table
          const { error, data } = await supabase
            .from('canvas_nodes')
            .insert({
              id: newNode.id, // Use same ID as React Flow node
              conversation_id: conversationId, // Board/conversation ID
              user_id: user.id, // User ID
              node_type: 'freehand', // Node type
              position_x: newNode.position.x, // X position in flow coordinates
              position_y: newNode.position.y, // Y position in flow coordinates
              width: newNode.width, // Node width
              height: newNode.height, // Node height
              data: newNode.data, // Node data (points array, initialSize, etc.)
            })
            .select()
            .single()

          if (error) {
            console.error('🎨 Error saving freehand node to database:', error, {
              code: error.code,
              message: error.message,
              details: error.details,
              hint: error.hint,
            })
            
            // Retry on network errors or temporary failures
            if (retryCount < maxRetries && (
              error.code === 'PGRST116' || // Network error
              error.message?.includes('fetch') || // Network fetch error
              error.message?.includes('network') || // Network error
              error.message?.includes('timeout') || // Timeout error
              !navigator.onLine // Offline
            )) {
              const delay = Math.min(1000 * Math.pow(2, retryCount), 5000) // Exponential backoff, max 5s
              console.log(`🎨 Retrying save in ${delay}ms (attempt ${retryCount + 1}/${maxRetries})`)
              setTimeout(() => saveNodeToDatabase(retryCount + 1, maxRetries), delay)
            } else {
              // Store failed save for retry later
              storeFailedSave(newNode, conversationId)
            }
          } else {
            console.log('🎨 ✅ Saved freehand node to database:', newNode.id, data)
            // Remove from failed saves if it was there
            removeFailedSave(newNode.id)
          }
        } catch (error: any) {
          console.error('🎨 Error saving freehand node:', error)
          
          // Retry on network errors
          if (retryCount < maxRetries && (
            error?.message?.includes('fetch') ||
            error?.message?.includes('network') ||
            error?.message?.includes('timeout') ||
            !navigator.onLine
          )) {
            const delay = Math.min(1000 * Math.pow(2, retryCount), 5000)
            console.log(`🎨 Retrying save in ${delay}ms (attempt ${retryCount + 1}/${maxRetries})`)
            setTimeout(() => saveNodeToDatabase(retryCount + 1, maxRetries), delay)
          } else {
            // Store failed save for retry later
            storeFailedSave(newNode, conversationId)
          }
        }
      }
      
      // Save asynchronously (don't block UI)
      saveNodeToDatabase()
    }
    
    clearStroke() // Ready for the next stroke
  }

  return (
    <div
      ref={overlayRef} // Needed so click-select can peek under the capture layer
      className="freehand-overlay" // CSS class for overlay styling
      onPointerDown={handlePointerDown} // Start drawing on pointer down
      onPointerMove={handlePointerMove} // Brush tip + stroke samples
      onPointerUp={handlePointerUp} // Finish drawing on pointer up
      onPointerCancel={handlePointerUp} // Treat cancel like up (clear or commit)
      onPointerLeave={handlePointerLeave} // Hide tip when idle leave
    >
      {/* Brush tip — fixed screen ring like spot eraser; zoom sets flow thickness */}
      {cursor && (
        <div
          className="pointer-events-none absolute rounded-full border border-gray-500/70 dark:border-gray-300/70"
          style={{
            left: cursor.x - brushDiameterPx / 2,
            top: cursor.y - brushDiameterPx / 2,
            width: brushDiameterPx,
            height: brushDiameterPx,
          }}
        />
      )}
      {/* SVG overlay for previewing current stroke */}
      <svg>
        {points.length > 0 && (
          <path
            d={pointsToPath(points, 1, brushDiameterPx)}
            className={inkKind === 'highlighter' ? undefined : 'freehand-path'} // Highlighter uses inline fill (not theme CSS)
            style={
              inkKind === 'highlighter'
                ? {
                    fill: strokeColor, // Marker color from Draw swatch
                    opacity: HIGHLIGHTER_OPACITY, // Let board content show through
                    mixBlendMode: 'multiply', // Classic highlighter over light boards
                    stroke: 'none',
                  }
                : {
                    fill: strokeColor, // Pencil also uses the selected swatch
                    stroke: 'none',
                  }
            }
          />
        )}
      </svg>
    </div>
  );
}

