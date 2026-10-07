'use client'

// One blue resize box around every selected frame, drawing, and shape.
// Corner dots scale the group; the row under the box is the only rotate + reactions menu.

import { useEffect, useRef, useState } from 'react' // Gesture refs + live box while a corner is dragged
import { RotateCw } from 'lucide-react' // Same rotate glyph as a single frame
import {
  useReactFlow, // setNodes + getNodes for the group transform
  useStore, // Bounds, viewport, and whether a marquee is in progress
  useStoreApi, // Sync RF's multi-node drag rect with the selection count
  type Node, // Selected RF nodes
} from 'reactflow'
import { useBoardRotation } from '@/components/board-rotation-context' // Camera heading — box must spin with the nodes layer
import { useIsThreadConnecting } from '@/components/threads/use-is-thread-connecting' // Hide the menu while a thread end is dragged
import { frameScreenChromeScale } from '@/components/threads/constants' // Screen-constant handle size and blue stroke
import { paneToFlow } from '@/lib/board-rotation' // Pointer → flow, including camera rotate
import { rotatedRectAabbSize } from '@/lib/frame-shape' // Drawing AABB after a group rotate
import { createClient } from '@/lib/supabase/client' // Persist drawing / shape geometry
import { useLiveBoardZoom } from '@/lib/use-live-board-zoom' // Painted zoom, not the lagging RF store
import {
  GROUP_COMMENTS_EVENT, // Reactions button → every selected frame
  GROUP_SELECT_TYPES, // chatPanel, freehand, shape
  GROUP_TRANSFORM_EVENT, // Frames apply scale / angle locally
  readLiveGroupGeom, // Painted rotation and fill size
  setGroupMultiSelect, // Tell individuals to drop handles and menus
  type GroupNodePatch,
  type GroupTransformDetail,
  type LiveGroupGeom,
} from '@/lib/group-selection'

const ROTATE_CLICK_SLOP_PX = 4 // Below this travel, the rotate control resets instead of turning
const MIN_GROUP_SCALE = 0.05 // Do not flip the box inside-out

type Corner = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right' // Which dot is dragged

type FlowBox = { x: number; y: number; width: number; height: number } // Axis-aligned group box

type Snap = {
  id: string // RF id
  type: string // Node type
  absX: number // Flow-absolute left
  absY: number // Flow-absolute top
  posX: number // position.x written back to the node
  posY: number // position.y
  w: number // Measured outer width
  h: number // Measured outer height
  frameScale: number // Starting locked scale
  rotation: number // Starting content angle
  unlocked: boolean // Explicit fill box
  contentW: number // Unrotated content width
  contentH: number // Unrotated content height
  data: Record<string, unknown> | null // Freehand payload
}

type BoundsState = { box: FlowBox; count: number } | null // Null when fewer than two objects

/** Opposite corner stays fixed while the dragged corner moves. */
function anchorFor(box: FlowBox, corner: Corner): { x: number; y: number } {
  if (corner === 'bottom-right') return { x: box.x, y: box.y } // Top-left stays
  if (corner === 'bottom-left') return { x: box.x + box.width, y: box.y } // Top-right stays
  if (corner === 'top-right') return { x: box.x, y: box.y + box.height } // Bottom-left stays
  return { x: box.x + box.width, y: box.y + box.height } // Bottom-right stays
}

/** The corner under the pointer at gesture start. */
function handleFor(box: FlowBox, corner: Corner): { x: number; y: number } {
  if (corner === 'top-left') return { x: box.x, y: box.y } // Box origin
  if (corner === 'top-right') return { x: box.x + box.width, y: box.y } // Top edge end
  if (corner === 'bottom-left') return { x: box.x, y: box.y + box.height } // Bottom edge start
  return { x: box.x + box.width, y: box.y + box.height } // Far corner
}

/** Uniform scale from how far the pointer moved away from the anchored corner. */
function scaleFromPointer(
  anchor: { x: number; y: number },
  handle: { x: number; y: number },
  pointer: { x: number; y: number }
): number {
  const hx = handle.x - anchor.x // Start offset of the dot
  const hy = handle.y - anchor.y
  const sx = Math.abs(hx) > 1 ? (pointer.x - anchor.x) / hx : 1 // Width axis
  const sy = Math.abs(hy) > 1 ? (pointer.y - anchor.y) / hy : 1 // Height axis
  return Math.max(MIN_GROUP_SCALE, (sx + sy) / 2) // Average keeps text frames proportional
}

/** Orbit a point around the group center. */
function rotatePoint(
  x: number,
  y: number,
  cx: number,
  cy: number,
  deg: number
): { x: number; y: number } {
  const rad = (deg * Math.PI) / 180 // Degrees → radians
  const dx = x - cx // Offset from center
  const dy = y - cy
  return {
    x: cx + dx * Math.cos(rad) - dy * Math.sin(rad), // Rotated x
    y: cy + dx * Math.sin(rad) + dy * Math.cos(rad), // Rotated y
  }
}

/**
 * Painted blue ring in flow space.
 * Upright frames keep RF XY at the fill and grow the ring with negative margins,
 * so the node box sits down-right of the ring (right gap, top-left past the frames).
 */
function paintedBox(node: Node): FlowBox | null {
  const w = typeof node.width === 'number' ? node.width : 0 // Border box — same size as the ring
  const h = typeof node.height === 'number' ? node.height : 0
  if (w < 1 || h < 1) return null // Unmeasured nodes cannot anchor the union
  const absX = node.positionAbsolute?.x ?? node.position.x // Fill origin for upright frames
  const absY = node.positionAbsolute?.y ?? node.position.y
  if (node.type !== 'chatPanel' || typeof document === 'undefined') {
    return { x: absX, y: absY, width: w, height: h } // Drawings and shapes paint on the RF box
  }
  const panel = document.querySelector(
    `.react-flow__node[data-id="${CSS.escape(node.id)}"] [data-panel-container="true"]`
  ) as HTMLElement | null // The element the blue ring is inset on
  if (!panel) return { x: absX, y: absY, width: w, height: h }
  const margin = getComputedStyle(panel) // Negative when the ring grows outside the fill origin
  const left = parseFloat(margin.marginLeft) || 0 // −gutter, or 0 when rotated (AABB is the RF box)
  const top = parseFloat(margin.marginTop) || 0
  return { x: absX + left, y: absY + top, width: w, height: h }
}

/** Union of painted rings. */
function unionBoxes(boxes: FlowBox[]): FlowBox | null {
  if (boxes.length === 0) return null
  let minX = Infinity // Left of the leftmost ring
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const box of boxes) {
    minX = Math.min(minX, box.x)
    minY = Math.min(minY, box.y)
    maxX = Math.max(maxX, box.x + box.width) // Right edge, not the RF fill edge
    maxY = Math.max(maxY, box.y + box.height)
  }
  if (!Number.isFinite(minX) || maxX - minX < 1 || maxY - minY < 1) return null
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY }
}

/** Measured box for one selected object, plus live geometry when the node has published it. */
function snapOf(node: Node): Snap | null {
  const painted = paintedBox(node) // Ring, not the fill-origin RF box
  if (!painted) return null // Unmeasured nodes cannot anchor a scale
  const w = painted.width
  const h = painted.height
  const absX = painted.x // Painted left — scale stays on the ring
  const absY = painted.y
  const live = readLiveGroupGeom(node.id) // Painted state beats metadata
  const data = (node.data || null) as Record<string, unknown> | null
  const geom: LiveGroupGeom = live ?? {
    frameScale: 1, // No publish yet
    rotation: 0,
    unlocked: false,
    contentW: w,
    contentH: h,
  }
  return {
    id: node.id,
    type: node.type || 'default',
    absX,
    absY,
    posX: node.position.x,
    posY: node.position.y,
    w,
    h,
    frameScale: geom.frameScale,
    rotation: geom.rotation,
    unlocked: geom.unlocked,
    contentW: geom.contentW > 0 ? geom.contentW : w, // Fall back to the outer box
    contentH: geom.contentH > 0 ? geom.contentH : h,
    data,
  }
}

/** Selected frames, drawings, and shapes currently on the board. */
function selectedGroupNodes(nodes: Node[]): Node[] {
  return nodes.filter((node) => node.selected && GROUP_SELECT_TYPES.has(node.type || '')) // Ignore placeholders
}


/** Bubble-with-two-lines glyph — same reactions mark as a single frame. */
function ReactionsIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-2.5 w-2.5 pointer-events-none" // Glyph ignores the click; the button owns it
      aria-hidden
    >
      <path d="M22 17a2 2 0 0 1-2 2H6.828a2 2 0 0 0-1.414.586l-2.202 2.202A.71.71 0 0 1 2 21.286V5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2z" />
      <path d="M8 9h8" />
      <path d="M9.5 13h5" />
    </svg>
  )
}

type Props = {
  canEdit: boolean // View-only boards show the box without transform controls
  onCommit?: (nodes: Node[]) => void // Collab layout publish after the gesture
}

/** Group adjust box rendered in pane space with the same viewport transform as nodes. */
export function MultiSelectResizeBox({ canEdit, onCommit }: Props) {
  const { setNodes, getNodes } = useReactFlow() // Write the scaled positions
  const store = useStoreApi() // nodesSelectionActive sync
  const gestureRef = useRef(false) // True while a corner or rotate drag owns the box
  const snapsRef = useRef<Snap[]>([]) // Objects frozen at gesture start
  const anchorRef = useRef<{ x: number; y: number } | null>(null) // Fixed corner
  const handleRef = useRef<{ x: number; y: number } | null>(null) // Starting dot
  const rotateRef = useRef<{ cx: number; cy: number; angle: number; pointerX: number; pointerY: number } | null>(null)
  const [gestureBox, setGestureBox] = useState<FlowBox | null>(null) // Box painted during a corner drag
  const isThreadConnecting = useIsThreadConnecting() // Hide menu while connecting
  const { rotation: boardRotation } = useBoardRotation() // Same CSS rotate the nodes layer uses
  const zoom = useLiveBoardZoom(true) // Live painted zoom
  const ui = frameScreenChromeScale(zoom || 1) // Handle / menu screen scale

  const live = useStore(
    (s): BoundsState => {
      const selected: Node[] = [] // Gather without allocating a full node list first
      s.nodeInternals.forEach((node) => {
        if (node.selected && GROUP_SELECT_TYPES.has(node.type || '')) selected.push(node) // Group members only
      })
      if (selected.length < 2 || s.userSelectionActive) return null // Marquee draws its own rect
      const box = unionBoxes(selected.map(paintedBox).filter((item): item is FlowBox => !!item))
      if (!box) return null // Not measured yet
      return { box, count: selected.length }
    },
    (a, b) =>
      a === b ||
      (!!a &&
        !!b &&
        a.count === b.count &&
        a.box.x === b.box.x &&
        a.box.y === b.box.y &&
        a.box.width === b.box.width &&
        a.box.height === b.box.height)
  )

  const transform = useStore(
    (s) => s.transform, // Viewport translate + zoom
    (a, b) => a[0] === b[0] && a[1] === b[1] && a[2] === b[2] // Skip identical pans
  )

  const dragging = useStore((s) => {
    let active = false // Any selected member mid-move
    s.nodeInternals.forEach((node) => {
      if (node.selected && node.dragging) active = true // RF drag flag
    })
    return active
  })

  // Keep RF's gap-drag rect in sync, and tell each object to hide its own handles.
  useEffect(() => {
    return store.subscribe(() => {
      const st = store.getState() // State after the update that woke us
      let count = 0 // Selected group members
      let nodeDragging = false // A member is moving
      st.nodeInternals.forEach((node) => {
        if (node.dragging) nodeDragging = true // Hide the RF rect during a node drag
        if (node.selected && GROUP_SELECT_TYPES.has(node.type || '')) count += 1
      })
      setGroupMultiSelect(count > 1) // Individuals drop handles as soon as a second object joins
      const want =
        count > 1 && !st.userSelectionActive && !nodeDragging && !gestureRef.current // Gap drag only when idle
      if (st.nodesSelectionActive !== want) store.setState({ nodesSelectionActive: want }) // One extra notify, then equal
    })
  }, [store])

  // Mark the flow so the default dotted selection rect stays invisible under our blue box.
  useEffect(() => {
    const dom = store.getState().domNode // RF root, which itself has .react-flow
    if (!dom) return
    if (live) dom.classList.add('tt-group-select') // Hide the stock dotted rect
    else dom.classList.remove('tt-group-select')
    return () => dom.classList.remove('tt-group-select') // Leave the class off when unmounted
  }, [live, store])

  const box = gestureBox ?? live?.box ?? null // Corner drag paints its own box so the dot tracks the pointer
  const showMenu = Boolean(box && canEdit && !dragging && !isThreadConnecting && !gestureBox) // Idle selection only

  /** Flow point under a pointer, or null when the pane box is missing. */
  function flowPoint(event: { clientX: number; clientY: number }): { x: number; y: number } | null {
    const st = store.getState()
    const pane = st.domNode?.getBoundingClientRect()
    if (!pane) return null
    return paneToFlow(
      event.clientX - pane.left, // Pane-local x
      event.clientY - pane.top,
      { x: st.transform[0], y: st.transform[1], zoom: st.transform[2] },
      boardRotation // Same heading as the nodes layer
    )
  }

  /** Write positions (and drawing/shape sizes) in one store update. */
  function applyPatches(patches: GroupNodePatch[]) {
    const byId = new Map(patches.map((patch) => [patch.id, patch])) // O(1) lookup
    setNodes((nodes) =>
      nodes.map((node) => {
        const patch = byId.get(node.id)
        if (!patch) return node // Untouched
        const next: Node = {
          ...node,
          position: { x: patch.x, y: patch.y }, // Orbit or scale
        }
        if (patch.type === 'freehand' || patch.type === 'shape') {
          next.width = patch.width // Outer box
          next.height = patch.height
          next.style = { ...node.style, width: patch.width, height: patch.height }
        }
        if (patch.type === 'freehand' && patch.data) {
          next.data = patch.data // Ink box + angle
        }
        return next
      })
    )
  }

  /** Ask each frame to paint the new scale or angle. */
  function emit(detail: GroupTransformDetail) {
    window.dispatchEvent(new CustomEvent(GROUP_TRANSFORM_EVENT, { detail })) // Frames own their TipTap box
  }

  /** Build the next geometry for a uniform scale about the anchored corner. */
  function patchesForScale(snaps: Snap[], s: number, anchor: { x: number; y: number }): GroupNodePatch[] {
    return snaps.map((snap) => {
      const absX = anchor.x + (snap.absX - anchor.x) * s // Scale left from the anchor
      const absY = anchor.y + (snap.absY - anchor.y) * s
      const width = snap.w * s // Outer box
      const height = snap.h * s
      const patch: GroupNodePatch = {
        id: snap.id,
        type: snap.type,
        x: snap.posX + (absX - snap.absX), // Keep parent-relative position in sync with the absolute delta
        y: snap.posY + (absY - snap.absY),
        width,
        height,
        frameScale: snap.frameScale * s, // Text grows with the box
        rotation: snap.rotation, // Resize does not turn
        content: { width: snap.contentW * s, height: snap.contentH * s },
        unlocked: snap.unlocked,
      }
      if (snap.type === 'freehand' && snap.data) {
        const content = { width: snap.contentW * s, height: snap.contentH * s } // Ink box
        patch.data = { ...snap.data, contentSize: content, rotation: snap.rotation }
      }
      return patch
    })
  }

  /** AABB of scaled snaps — the box the pointer is dragging. */
  function boxForScale(snaps: Snap[], s: number, anchor: { x: number; y: number }): FlowBox {
    let minX = Infinity
    let minY = Infinity
    let maxX = -Infinity
    let maxY = -Infinity
    snaps.forEach((snap) => {
      const x = anchor.x + (snap.absX - anchor.x) * s
      const y = anchor.y + (snap.absY - anchor.y) * s
      minX = Math.min(minX, x)
      minY = Math.min(minY, y)
      maxX = Math.max(maxX, x + snap.w * s)
      maxY = Math.max(maxY, y + snap.h * s)
    })
    return { x: minX, y: minY, width: maxX - minX, height: maxY - minY }
  }

  /** Orbit each object around the group center and add the same angle. */
  function patchesForRotate(snaps: Snap[], delta: number, cx: number, cy: number): GroupNodePatch[] {
    return snaps.map((snap) => {
      const nextRot = snap.rotation + delta // Content turns with the group
      let width = snap.w
      let height = snap.h
      let absX = snap.absX
      let absY = snap.absY
      if (snap.type === 'freehand') {
        const aabb = rotatedRectAabbSize(snap.contentW, snap.contentH, nextRot) // Ink stays centered in a new upright box
        const center = rotatePoint(snap.absX + snap.w / 2, snap.absY + snap.h / 2, cx, cy, delta)
        width = aabb.width
        height = aabb.height
        absX = center.x - width / 2
        absY = center.y - height / 2
      } else {
        const center = rotatePoint(snap.absX + snap.w / 2, snap.absY + snap.h / 2, cx, cy, delta)
        absX = center.x - width / 2 // Box size stays until the frame pushes its own AABB
        absY = center.y - height / 2
      }
      const patch: GroupNodePatch = {
        id: snap.id,
        type: snap.type,
        x: snap.posX + (absX - snap.absX),
        y: snap.posY + (absY - snap.absY),
        width,
        height,
        frameScale: snap.frameScale,
        rotation: snap.type === 'shape' ? snap.rotation : nextRot, // Shapes have no content angle
        content: { width: snap.contentW, height: snap.contentH },
        unlocked: snap.unlocked,
      }
      if (snap.type === 'freehand' && snap.data) {
        patch.data = {
          ...snap.data,
          rotation: nextRot,
          contentSize: { width: snap.contentW, height: snap.contentH },
        }
      }
      return patch
    })
  }

  /** Persist drawings and shapes; frames persist from their own listener. */
  async function persistCanvas(patches: GroupNodePatch[]) {
    const canvas = patches.filter((patch) => patch.type === 'freehand' || patch.type === 'shape')
    if (canvas.length === 0) return
    try {
      const supabase = createClient()
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) return
      for (const patch of canvas) {
        const row: {
          position_x: number
          position_y: number
          width: number
          height: number
          data?: Record<string, unknown>
        } = {
          position_x: patch.x, // Flow position
          position_y: patch.y,
          width: patch.width,
          height: patch.height,
        }
        if (patch.data) row.data = patch.data // Freehand angle + ink box
        const { error } = await supabase
          .from('canvas_nodes')
          .update(row)
          .eq('id', patch.id)
          .eq('user_id', user.id)
        if (error) console.error('Group resize save failed:', error)
      }
    } catch (err) {
      console.error('Group resize save failed:', err)
    }
  }

  /** Finish a gesture: persist, publish collab layout, drop the frozen box. */
  function finish(patches: GroupNodePatch[], kind: 'resize' | 'rotate') {
    emit({ phase: 'end', kind, patches }) // Frames write metadata
    void persistCanvas(patches) // Drawings and shapes
    onCommit?.(getNodes().filter((node) => node.selected)) // Peer layout
    gestureRef.current = false // Subscriber may now restore the gap-drag rect
    snapsRef.current = []
    anchorRef.current = null
    handleRef.current = null
    rotateRef.current = null
    setGestureBox(null) // Fall back to measured bounds
    store.setState({ nodesSelectionActive: true }) // Gap between objects moves the selection again
  }

  /** Corner dot pointer-down: freeze the selection and the anchored corner. */
  function onCornerDown(corner: Corner, event: React.PointerEvent<HTMLDivElement>) {
    if (!canEdit || !box) return
    event.stopPropagation() // Do not start a group move
    event.preventDefault()
    const snaps = selectedGroupNodes(getNodes())
      .map(snapOf)
      .filter((snap): snap is Snap => snap != null)
    if (snaps.length < 2) return
    snapsRef.current = snaps
    anchorRef.current = anchorFor(box, corner) // Fixed corner
    handleRef.current = handleFor(box, corner) // Dot at start
    gestureRef.current = true
    setGestureBox(box) // Hold this rect until the pointer moves
    emit({
      phase: 'start',
      kind: 'resize',
      patches: snaps.map((snap) => ({
        id: snap.id,
        type: snap.type,
        x: snap.posX,
        y: snap.posY,
        width: snap.w,
        height: snap.h,
      })),
    })
    event.currentTarget.setPointerCapture(event.pointerId) // Keep the drag if the pointer leaves the dot
  }

  /** Corner move: scale every snapped object about the anchor. */
  function onCornerMove(event: React.PointerEvent<HTMLDivElement>) {
    if (!gestureRef.current || !anchorRef.current || !handleRef.current) return
    const pointer = flowPoint(event)
    if (!pointer) return
    const s = scaleFromPointer(anchorRef.current, handleRef.current, pointer)
    const patches = patchesForScale(snapsRef.current, s, anchorRef.current)
    applyPatches(patches) // Positions + drawing sizes
    emit({ phase: 'move', kind: 'resize', patches }) // Frame scale / fill
    setGestureBox(boxForScale(snapsRef.current, s, anchorRef.current)) // Dot stays on the pointer
  }

  /** Corner up: persist the last scale. */
  function onCornerUp(event: React.PointerEvent<HTMLDivElement>) {
    if (!gestureRef.current || !anchorRef.current || !handleRef.current) return
    const pointer = flowPoint(event)
    const s = pointer
      ? scaleFromPointer(anchorRef.current, handleRef.current, pointer)
      : 1
    const patches = patchesForScale(snapsRef.current, s, anchorRef.current)
    applyPatches(patches)
    finish(patches, 'resize')
  }

  /** Rotate pointer-down: remember the group center and the starting angle. */
  function onRotateDown(event: React.PointerEvent<HTMLButtonElement>) {
    if (!canEdit || !box) return
    event.stopPropagation()
    event.preventDefault()
    const snaps = selectedGroupNodes(getNodes())
      .map(snapOf)
      .filter((snap): snap is Snap => snap != null)
    if (snaps.length < 2) return
    const point = flowPoint(event)
    if (!point) return
    snapsRef.current = snaps
    const cx = box.x + box.width / 2 // Group center
    const cy = box.y + box.height / 2
    rotateRef.current = {
      cx,
      cy,
      angle: Math.atan2(point.y - cy, point.x - cx), // Start angle
      pointerX: event.clientX, // Click-vs-drag slop in screen px
      pointerY: event.clientY,
    }
    gestureRef.current = true
    emit({
      phase: 'start',
      kind: 'rotate',
      patches: snaps.map((snap) => ({
        id: snap.id,
        type: snap.type,
        x: snap.posX,
        y: snap.posY,
        width: snap.w,
        height: snap.h,
        rotation: snap.rotation,
      })),
    })
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  /** Rotate move: orbit positions and add the delta to each content angle. */
  function onRotateMove(event: React.PointerEvent<HTMLButtonElement>) {
    const start = rotateRef.current
    if (!gestureRef.current || !start) return
    const point = flowPoint(event)
    if (!point) return
    const angle = Math.atan2(point.y - start.cy, point.x - start.cx)
    const delta = ((angle - start.angle) * 180) / Math.PI // Degrees since pointer-down
    const patches = patchesForRotate(snapsRef.current, delta, start.cx, start.cy)
    applyPatches(patches)
    emit({ phase: 'move', kind: 'rotate', patches })
  }

  /** Rotate up: a short press resets every angle; a drag commits the turn. */
  function onRotateUp(event: React.PointerEvent<HTMLButtonElement>) {
    const start = rotateRef.current
    if (!gestureRef.current || !start) return
    const dx = event.clientX - start.pointerX
    const dy = event.clientY - start.pointerY
    const click = dx * dx + dy * dy <= ROTATE_CLICK_SLOP_PX * ROTATE_CLICK_SLOP_PX
    if (click) {
      const patches = snapsRef.current.map((snap) => {
        const upright =
          snap.type === 'freehand'
            ? rotatedRectAabbSize(snap.contentW, snap.contentH, 0) // Back to the ink box
            : { width: snap.w, height: snap.h }
        const patch: GroupNodePatch = {
          id: snap.id,
          type: snap.type,
          x: snap.posX, // Reset turns content; it does not un-orbit
          y: snap.posY,
          width: upright.width,
          height: upright.height,
          frameScale: snap.frameScale,
          rotation: 0,
          content: { width: snap.contentW, height: snap.contentH },
          unlocked: snap.unlocked,
        }
        if (snap.type === 'freehand' && snap.data) {
          patch.data = {
            ...snap.data,
            rotation: 0,
            contentSize: { width: snap.contentW, height: snap.contentH },
          }
        }
        return patch
      })
      applyPatches(patches)
      finish(patches, 'rotate')
      return
    }
    const point = flowPoint(event)
    const angle = point ? Math.atan2(point.y - start.cy, point.x - start.cx) : start.angle
    const delta = ((angle - start.angle) * 180) / Math.PI
    const patches = patchesForRotate(snapsRef.current, delta, start.cx, start.cy)
    applyPatches(patches)
    finish(patches, 'rotate')
  }

  if (!box) return null // Single selection keeps per-object chrome

  const corners: Corner[] = ['top-left', 'top-right', 'bottom-left', 'bottom-right']

  return (
    <div
      className="tt-group-resize-layer nopan" // Pane-space layer; transform matches the viewport
      style={{
        position: 'absolute',
        inset: 0,
        zIndex: 4, // Above RF's dotted selection rect (z-index 3)
        pointerEvents: 'none', // Gap drags fall through to that rect
        transform: `translate(${transform[0]}px, ${transform[1]}px) rotate(${boardRotation}deg) scale(${transform[2]})`, // Same camera as other board overlays
        transformOrigin: '0 0', // Same origin as the node viewport
      }}
    >
      <div
        className="tt-group-resize"
        data-panel-container="true" // Chrome CSS targets this box like a frame
        style={{
          position: 'absolute',
          left: box.x, // Flow left
          top: box.y,
          width: box.width,
          height: box.height,
          pointerEvents: 'none', // Interior moves the selection via the RF rect underneath
          ['--tt-frame-ui-scale' as string]: String(ui), // Screen-constant dots and menu
        }}
      >
        <div
          aria-hidden
          data-tt-adjust-ring
          className="pointer-events-none absolute inset-0 z-[19]"
          style={{ boxShadow: `inset 0 0 0 ${ui}px #3b82f6` }} // Screen-constant blue stroke
        />
        {canEdit &&
          !dragging &&
          corners.map((corner) => (
            <div
              key={corner}
              className={`react-flow__resize-control handle nodrag nopan ${corner.replace('-', ' ')}`} // `top left` matches RF corner CSS
              style={{ pointerEvents: 'auto', zIndex: 60, borderRadius: '50%', background: 'var(--tt-group-handle, #fff)' }}
              onPointerDown={(event) => onCornerDown(corner, event)}
              onPointerMove={onCornerMove}
              onPointerUp={onCornerUp}
              onPointerCancel={onCornerUp}
            />
          ))}
        {showMenu && (
          <div
            data-frame-chrome
            className="nodrag nopan absolute z-[25] flex items-center gap-0.5"
            style={{ left: 0, top: '100%', pointerEvents: 'auto' }} // Under the box, same row as a frame
            onPointerDown={(event) => event.stopPropagation()} // Do not move the selection from the menu
          >
            <button
              type="button"
              className="flex h-5 w-5 items-center justify-center rounded-full text-gray-700 hover:bg-gray-100 dark:text-gray-200 dark:hover:bg-gray-800"
              style={{ cursor: 'grab' }}
              title="Drag to rotate · click to reset"
              aria-label="Rotate selection — drag to turn, click to reset"
              onPointerDown={onRotateDown}
              onPointerMove={onRotateMove}
              onPointerUp={onRotateUp}
              onPointerCancel={onRotateUp}
              onClick={(event) => event.stopPropagation()}
            >
              <RotateCw className="h-2.5 w-2.5 pointer-events-none" />
            </button>
            <button
              type="button"
              className="flex h-5 w-5 items-center justify-center rounded-full text-gray-700 hover:bg-gray-100 dark:text-gray-200 dark:hover:bg-gray-800"
              title="Reactions"
              aria-label="Reactions"
              onClick={(event) => {
                event.stopPropagation() // Keep the selection
                event.preventDefault()
                window.dispatchEvent(new Event(GROUP_COMMENTS_EVENT)) // Every selected frame toggles
              }}
            >
              <ReactionsIcon />
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
