'use client'

// Stack mark on the host’s facing sim connection point (same CSS slot as ConnectionIndicator).
// Each side (top/right/bottom/left) has its own stack tree.
// • Rounded blue triangle + white rim (sim-point paint language) — tip toward the mate
// • In-frame absolute + --tt-frame-ui-scale — stays centered through pan/zoom like other sim-points
// • Stack under does not lock — only Lock frames moves the pair together
// • Hover stack mark → faded peek at restoreAbs; unhover hides unless mark clicked (menu) or opened

import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useReactFlow, useStore } from 'reactflow'
import { isBoardNavigating } from '@/lib/board-navigating'
import { isFrameDragging } from '@/lib/frame-dragging'
import { Eye, Lock, ArrowLeft, ArrowRight, ArrowUp, ArrowDown } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import {
  stackExpandLayout,
  stackExpandRfAbs,
  type FrameStackSide,
} from '@/components/use-frame-nest-stack-drag'
import {
  frameAdjustFlowBox,
  frameAdjustFlowBoxAt,
  frameAdjustFlowSize,
  rfAbsFromAdjustOrigin,
} from '@/lib/frame-adjust-box'
import { THREAD_DEFAULT_COLOR, THREAD_SELECTED_COLOR } from '@/components/threads/constants' // gapThread color token
import {
  collectNestedSatelliteIds,
  findOwningMateId,
  findStackEntry,
  isGroupLocked,
  patchGroupEntry,
  readSideStacks,
  readXY,
  rekeyGroupSide,
  setGroupLocked,
  setParentStackHidden,
  stackIndexInGroup,
  FRAME_STACK_SIDES,
} from '@/lib/frame-side-stacks'
import { absFlowPosition } from '@/components/use-block-group-drag'
import { persistBlockPlacement } from '@/lib/blocks'
import { cn } from '@/lib/utils'

const HOVER_DWELL_MS = 100 // Fast preview when the gap mark is hovered
const PREVIEW_OUT_MS = 80 // Fade-out duration before hidden (match globals.css)

type FrameStackRevealLineProps = {
  nodeId: string // Frame this line sits on (inward side of the gap)
  stackGroupId: string
  stackSide: FrameStackSide // Direction toward the next mate (adjust-box side)
  frameUiScale?: number
  /** Selected or frame-hover — fades the mark in/out (stays mounted for the transition). */
  visible?: boolean
  /** Keep host `isFrameHovering` while the mark / portaled menu is under the pointer. */
  onHoverBridge?: (hovering: boolean) => void
}

function oppositeSide(side: FrameStackSide): FrameStackSide {
  if (side === 'right') return 'left'
  if (side === 'left') return 'right'
  if (side === 'top') return 'bottom'
  return 'top'
}

function stackIndexOf(n: { data?: unknown }, groupId: string): number {
  const data = n.data as { promptMessage?: { metadata?: unknown } } | undefined
  return stackIndexInGroup(
    (data?.promptMessage?.metadata || {}) as Record<string, unknown>,
    groupId
  )
}

function nodeStackMeta(n: { data?: unknown }): Record<string, unknown> {
  const data = n.data as { promptMessage?: { metadata?: unknown } } | undefined
  return (data?.promptMessage?.metadata || {}) as Record<string, unknown>
}

function nodeMessageId(n: { data?: unknown }): string | undefined {
  const data = n.data as { promptMessage?: { id?: string } } | undefined
  return typeof data?.promptMessage?.id === 'string' ? data.promptMessage.id : undefined
}

function entryExpanded(
  meta: Record<string, unknown>,
  groupId: string
): boolean {
  return findStackEntry(meta, groupId)?.entry.expanded === true
}

/** Degrees so the triangle tip aims outward along this stack side (toward the mate). */
function stackArrowDegrees(side: FrameStackSide): number {
  return side === 'right' ? 0 : side === 'left' ? 180 : side === 'bottom' ? 90 : -90
}

/** Mate nodes in this side’s stack group (excludes host), sorted by stackIndex. */
function collectMates(
  getNodes: () => ReturnType<ReturnType<typeof useReactFlow>['getNodes']>,
  nodeId: string,
  stackGroupId: string
) {
  return getNodes()
    .filter((n) => {
      if (n.id === nodeId || n.type !== 'chatPanel') return false
      return !!findStackEntry(nodeStackMeta(n), stackGroupId)
    })
    .sort((a, b) => stackIndexOf(a, stackGroupId) - stackIndexOf(b, stackGroupId))
}

/** All frames in this side’s group (including host). */
function collectGroup(
  getNodes: () => ReturnType<ReturnType<typeof useReactFlow>['getNodes']>,
  stackGroupId: string
) {
  return getNodes().filter((n) => {
    if (n.type !== 'chatPanel') return false
    return !!findStackEntry(nodeStackMeta(n), stackGroupId)
  })
}

/**
 * Park nested side-tree satellites relative to already-placed mates.
 * Skips the parent `excludeGroupId` so A’s bottom pack lays out from A, not from B.
 */
function layoutNestedFromMates(
  live: ReturnType<ReturnType<typeof useReactFlow>['getNodes']>,
  placedPos: Map<string, { x: number; y: number }>,
  excludeGroupId: string,
  zoom: number
): Map<string, { x: number; y: number }> {
  const nestedPos = new Map<string, { x: number; y: number }>()
  const sizeOf = (id: string) => frameAdjustFlowSize(live.find((x) => x.id === id)!, zoom)
  const queue = [...placedPos.keys()]
  const visitedGroups = new Set<string>([excludeGroupId])
  while (queue.length > 0) {
    const pid = queue.shift() as string
    const pPos = placedPos.get(pid) || nestedPos.get(pid)
    if (!pPos) continue
    const pNode = live.find((n) => n.id === pid)
    if (!pNode) continue
    const pAdjust = frameAdjustFlowBoxAt(pNode, pPos, zoom)
    const stacks = readSideStacks(nodeStackMeta(pNode))
    for (const side of FRAME_STACK_SIDES) {
      const entry = stacks[side]
      if (!entry || visitedGroups.has(entry.groupId)) continue
      // Only hosts of this side tree fan mates outward
      if (!(entry.index === 0 || entry.anchor === true)) continue
      visitedGroups.add(entry.groupId)
      const mates = live
        .filter((n) => {
          if (n.id === pid || n.type !== 'chatPanel') return false
          return !!findStackEntry(nodeStackMeta(n), entry.groupId)
        })
        .sort(
          (a, b) =>
            stackIndexInGroup(nodeStackMeta(a), entry.groupId) -
            stackIndexInGroup(nodeStackMeta(b), entry.groupId)
        )
      const sizes = mates.map((n) => sizeOf(n.id))
      mates.forEach((mate, order) => {
        const adjustOrigin = stackExpandLayout(
          pAdjust,
          side,
          sizes[order],
          order,
          sizes.slice(0, order)
        )
        const pos = rfAbsFromAdjustOrigin(adjustOrigin, mate, zoom)
        nestedPos.set(mate.id, pos)
        placedPos.set(mate.id, pos) // Allow deeper nesting from this mate
        queue.push(mate.id)
      })
    }
  }
  return nestedPos
}

function clearPreviewStyle(n: { style?: Record<string, unknown>; className?: string }) {
  const { opacity: _o, ...restStyle } = (n.style || {}) as Record<string, unknown>
  const className = (n.className || '')
    .split(/\s+/)
    .filter((c) => c && c !== 'tt-stack-preview' && c !== 'tt-stack-preview-out')
    .join(' ')
  return { restStyle, className: className || undefined }
}

/** Gap mark on the outward side of this frame: thread head, or a diamond when unthreaded. */
export function FrameStackRevealLine({
  nodeId,
  stackGroupId,
  stackSide,
  visible = true,
  onHoverBridge,
}: FrameStackRevealLineProps) {
  const { getNodes, setNodes } = useReactFlow()
  const mateKeyRef = useRef('')
  const transformKeyRef = useRef('')
  // Re-render when stack mate expand/hidden/lock changes (RF v11: nodeInternals)
  const mateStateKey = useStore((s) => {
    if (isBoardNavigating() || isFrameDragging()) return mateKeyRef.current
    const parts: string[] = []
    s.nodeInternals.forEach((n) => {
      if (n.type !== 'chatPanel') return
      const m = nodeStackMeta(n)
      if (n.id !== nodeId && !findStackEntry(m, stackGroupId)) return
      if (n.id === nodeId && !findStackEntry(m, stackGroupId)) return
      const lock = isGroupLocked(m, stackGroupId) ? 1 : 0
      const expanded = entryExpanded(m, stackGroupId) ? 1 : 0
      parts.push(`${n.id}:${expanded}:${n.hidden ? 1 : 0}:${lock}:${n.selected ? 1 : 0}`)
    })
    const next = parts.join('|')
    mateKeyRef.current = next
    return next
  })
  const viewportKey = useStore((s) => {
    const key = s.transform.join(',')
    if (isBoardNavigating() || isFrameDragging()) return transformKeyRef.current || key
    transformKeyRef.current = key
    return key
  }) // Re-place the portaled mark on pan/zoom (frozen mid-gesture)
  const gapThreadRef = useRef('') // Last thread token so pan/drag does not rescan edges
  const mateIdRef = useRef('') // Next outward mate, so a drag tick can read its live position
  // Re-place the mark while a frame moves — the settled subscriptions freeze mid-drag
  const dragPlaceKey = useStore((s) => {
    if (!isFrameDragging()) return ''
    const host = s.nodeInternals.get(nodeId)
    const mate = mateIdRef.current ? s.nodeInternals.get(mateIdRef.current) : undefined
    const hp = host?.positionAbsolute ?? host?.position
    const mp = mate?.positionAbsolute ?? mate?.position
    if (!hp) return ''
    return `${hp.x.toFixed(1)},${hp.y.toFixed(1)},${host?.width ?? 0},${host?.height ?? 0}|${
      mp ? `${mp.x.toFixed(1)},${mp.y.toFixed(1)},${mate?.width ?? 0},${mate?.height ?? 0}` : ''
    }`
  })
  // "color|out|0" when a thread joins this frame to the next outward mate; "" when the gap is unthreaded
  const gapThread = useStore((s) => {
    if (isBoardNavigating() || isFrameDragging()) return gapThreadRef.current // Keep the last mark while the board moves
    const host = s.nodeInternals.get(nodeId)
    if (!host || host.type !== 'chatPanel') {
      gapThreadRef.current = ''
      return ''
    }
    const hostIdx = stackIndexInGroup(nodeStackMeta(host), stackGroupId) // This frame's place in the side tree
    let nextId = ''
    let nextIdx = Number.POSITIVE_INFINITY
    s.nodeInternals.forEach((n) => {
      if (n.id === nodeId || n.type !== 'chatPanel') return
      const found = findStackEntry(nodeStackMeta(n), stackGroupId)
      if (!found) return // Not in this side's tree
      const idx = found.entry.anchor ? 0 : found.entry.index
      if (idx <= hostIdx || idx >= nextIdx) return // Only the next mate further out
      nextIdx = idx
      nextId = n.id
    })
    if (!nextId) {
      gapThreadRef.current = ''
      return ''
    }
    const mate = s.nodeInternals.get(nextId)
    let found = ''
    for (const edge of s.edges) {
      const toMate = edge.source === nodeId && edge.target === nextId // Thread leaves this frame toward the mate
      const toHost = edge.target === nodeId && edge.source === nextId
      if (!toMate && !toHost) continue
      const data = edge.data as { strokeColor?: string } | undefined
      const color = edge.selected
        ? THREAD_SELECTED_COLOR // Same blue the thread head uses while selected
        : data?.strokeColor || THREAD_DEFAULT_COLOR
      const hidden = host.hidden === true || mate?.hidden === true // Hidden mate: the thread does not paint the centered head
      found = `${color}|${toMate ? 'out' : 'in'}|${hidden ? 1 : 0}`
      break
    }
    gapThreadRef.current = found
    return found
  })
  const [previewing, setPreviewing] = useState(false) // Hover-dwell preview active
  const [menuOpen, setMenuOpen] = useState(false) // Eye / Stack / Lock menu
  const [menuPos, setMenuPos] = useState({ x: 0, y: 0 }) // Screen coords for portal menu
  const dwellRef = useRef<number | null>(null)
  const endPreviewRef = useRef<number | null>(null) // Short delay so leave does not flicker
  const previewOutTimerRef = useRef<number | null>(null) // Fade-out then commit hide
  const previewingRef = useRef(false)
  previewingRef.current = previewing
  const menuOpenRef = useRef(false) // Leave handlers must not dismiss while the menu is open
  menuOpenRef.current = menuOpen
  // Clicked the sim-point — keep peek until menu closes or Open stack / mate open commits
  const previewPinnedRef = useRef(false)
  const mateIdsRef = useRef<Set<string>>(new Set()) // Mate ids for click-to-open while peeking
  // Snapshot before hover preview so cancel can restore (e.g. one open, rest stacked)
  const prePreviewRef = useRef<
    { id: string; expanded: boolean; hidden: boolean }[] | null
  >(null)

  const clearDwell = useCallback(() => {
    if (dwellRef.current != null) {
      window.clearTimeout(dwellRef.current)
      dwellRef.current = null
    }
  }, [])

  const clearEndPreview = useCallback(() => {
    if (endPreviewRef.current != null) {
      window.clearTimeout(endPreviewRef.current)
      endPreviewRef.current = null
    }
  }, [])

  const clearPreviewOut = useCallback(() => {
    if (previewOutTimerRef.current != null) {
      window.clearTimeout(previewOutTimerRef.current)
      previewOutTimerRef.current = null
    }
  }, [])

  useEffect(
    () => () => {
      clearDwell()
      clearEndPreview()
      clearPreviewOut()
    },
    [clearDwell, clearEndPreview, clearPreviewOut]
  )

  /** Place mates at expand layout (visible). `expanded` = full open vs faded preview.
   *  Nested side-tree satellites (e.g. C on A’s bottom) park with their owning mate.
   *  `onlyId` → that mate alone (+ its nested), always parked flush next to the host. */
  const showMatesOut = useCallback(
    (expanded: boolean, onlyId?: string | null) => {
      const live = getNodes()
      const host = live.find((n) => n.id === nodeId)
      if (!host) return
      const zoom = Number(String(viewportKey).split(',')[2]) || 1
      const sortedMates = collectMates(getNodes, nodeId, stackGroupId)
      // Layout order: single open → just that mate at host edge;
      // preview/show-all → already-open mates stay closest, then stacked ones further out
      let layoutMates = sortedMates
      if (onlyId) {
        layoutMates = sortedMates.filter((n) => n.id === onlyId)
      } else if (!expanded) {
        const openFirst: typeof sortedMates = []
        const rest: typeof sortedMates = []
        for (const n of sortedMates) {
          const m = nodeStackMeta(n)
          if (!n.hidden && entryExpanded(m, stackGroupId)) openFirst.push(n)
          else rest.push(n)
        }
        layoutMates = [...openFirst, ...rest]
      }
      const posById = new Map<string, { x: number; y: number }>()
      layoutMates.forEach((n, order) => {
        const stamped = findStackEntry(nodeStackMeta(n), stackGroupId)?.entry.restoreAbs
        const wasCollapsed = n.hidden === true || !entryExpanded(nodeStackMeta(n), stackGroupId)
        // Hover preview + full open: restoreAbs so the original thread geometry returns.
        // Open-one still parks flush beside the host.
        let pos: { x: number; y: number }
        if (onlyId && expanded) {
          pos = stackExpandRfAbs(host, live, stackSide, n, order, layoutMates.slice(0, order), zoom)
        } else if (wasCollapsed && stamped) {
          pos = stamped // Pre-stack XY — thread paints as before Stack under
        } else if (expanded && !onlyId) {
          pos = absFlowPosition(n, live) // Already open — keep live board spot
        } else {
          pos = stackExpandRfAbs(host, live, stackSide, n, order, layoutMates.slice(0, order), zoom) // No restoreAbs
        }
        posById.set(n.id, pos)
      })
      // Nested satellites of the mates we’re showing (A’s bottom C, etc.)
      const showMateIds = layoutMates.map((n) => n.id)
      const nestedIds = collectNestedSatelliteIds(live, showMateIds, [stackGroupId])
      // Prefer each satellite’s own restoreAbs on hover/open; else fan from its owning mate
      for (const id of nestedIds) {
        const sat = live.find((x) => x.id === id)
        if (!sat) continue
        const stamped = findStackEntry(nodeStackMeta(sat), stackGroupId)?.entry.restoreAbs
        // Nested may store restore on another tree — also try parentStackRestoreAbs
        const parentRestore = readXY(
          (nodeStackMeta(sat) as { parentStackRestoreAbs?: unknown }).parentStackRestoreAbs
        )
        const wasCollapsed = sat.hidden === true
        if (!onlyId && wasCollapsed && (stamped || parentRestore)) {
          posById.set(id, stamped || parentRestore!)
        }
      }
      const nestedPos = layoutNestedFromMates(live, new Map(posById), stackGroupId, zoom)
      for (const [id, pos] of nestedPos) {
        if (nestedIds.includes(id) && !posById.has(id)) posById.set(id, pos) // Fill gaps only
      }
      // Hide other direct mates (+ their nested) when opening a single mate
      const hideMateIds = onlyId
        ? sortedMates.filter((n) => n.id !== onlyId).map((n) => n.id)
        : []
      const hideNestedIds = onlyId
        ? collectNestedSatelliteIds(live, hideMateIds, [stackGroupId])
        : []
      // Promote opened mate to front of stack (index 1); renumber the rest 2..n
      const indexById = new Map<string, number>()
      if (onlyId && expanded) {
        indexById.set(onlyId, 1)
        let next = 2
        for (const m of sortedMates) {
          if (m.id === onlyId) continue
          indexById.set(m.id, next++)
        }
      }
      const showSet = new Set([...showMateIds, ...nestedIds])
      const hideSet = new Set([...hideMateIds, ...hideNestedIds])
      setNodes((nds) =>
        nds.map((n) => {
          if (hideSet.has(n.id)) {
            const m = nodeStackMeta(n)
            let meta = findStackEntry(m, stackGroupId)
              ? patchGroupEntry(m, stackGroupId, { expanded: false })
              : m
            const idx = indexById.get(n.id)
            if (typeof idx === 'number' && findStackEntry(meta, stackGroupId)) {
              meta = patchGroupEntry(meta, stackGroupId, { index: idx })
            }
            // Nested under the still-collapsed parent group until a full open clears it
            meta = setParentStackHidden(meta, stackGroupId)
            const { restStyle, className } = clearPreviewStyle(
              n as { style?: Record<string, unknown>; className?: string }
            )
            return {
              ...n,
              hidden: true,
              style: restStyle,
              className,
              data: {
                ...n.data,
                promptMessage: n.data?.promptMessage
                  ? { ...n.data.promptMessage, metadata: meta }
                  : n.data?.promptMessage,
              },
            }
          }
          const pos = posById.get(n.id)
          if (!pos || !showSet.has(n.id)) return n
          const m = nodeStackMeta(n)
          let meta = findStackEntry(m, stackGroupId)
            ? patchGroupEntry(m, stackGroupId, { expanded })
            : m
          // Clear nested-hide marker while preview/open shows this satellite
          meta = setParentStackHidden(meta, null)
          if (expanded && findStackEntry(meta, stackGroupId)) {
            meta = setGroupLocked(meta, stackGroupId, false) // Full open → drag each frame alone
          }
          meta = { ...meta, position: pos }
          const idx = indexById.get(n.id)
          if (typeof idx === 'number' && findStackEntry(meta, stackGroupId)) {
            meta = patchGroupEntry(meta, stackGroupId, { index: idx })
          }
          const { restStyle: clearedStyle, className: baseClass } = clearPreviewStyle(
            n as { style?: Record<string, unknown>; className?: string }
          ) // Drop stale out-anim if re-hover mid fade
          return {
            ...n,
            position: pos,
            hidden: false,
            zIndex: expanded ? 3 : 2,
            style: {
              ...clearedStyle,
              ...(expanded ? { opacity: 1 } : {}), // Peek: CSS `.tt-stack-preview` animates opacity
              pointerEvents: 'all',
            },
            className: cn(baseClass, !expanded && 'tt-stack-preview'),
            data: {
              ...n.data,
              promptMessage: n.data?.promptMessage
                ? { ...n.data.promptMessage, metadata: meta }
                : n.data?.promptMessage,
            },
          }
        })
      )
    },
    [getNodes, nodeId, setNodes, stackGroupId, stackSide, viewportKey]
  )

  /** Stack under `keeperId` — that frame stays visible; others (+ nested side packs) hide. Does not lock. */
  const actionStackUnder = useCallback(
    async (keeperId: string) => {
      setMenuOpen(false)
      clearPreviewOut()
      previewPinnedRef.current = false
      prePreviewRef.current = null // Collapse is the new baseline
      setPreviewing(false)
      const live = getNodes()
      const group = collectGroup(getNodes, stackGroupId)
      if (group.length === 0) return
      // Side points from keeper toward where the hidden pack sits
      const newSide = keeperId === nodeId ? stackSide : oppositeSide(stackSide)
      // Renumber: keeper = 0; others keep relative order among themselves
      const others = group
        .filter((n) => n.id !== keeperId)
        .sort((a, b) => stackIndexOf(a, stackGroupId) - stackIndexOf(b, stackGroupId))
      const indexById = new Map<string, number>()
      indexById.set(keeperId, 0)
      others.forEach((n, i) => indexById.set(n.id, i + 1))
      // Pre-collapse XY per mate — Open stack restores these so the thread looks as before
      const restoreById = new Map<string, { x: number; y: number }>()
      for (const n of others) {
        restoreById.set(n.id, absFlowPosition(n, live))
      }

      // Nested satellites of frames going under the keeper (hide with their owners)
      const hideNestedIds = collectNestedSatelliteIds(
        live,
        others.map((n) => n.id),
        [stackGroupId]
      )
      // Keeper’s own nested packs stay visible — clear any stale parentStackHidden
      const keeperNestedIds = collectNestedSatelliteIds(live, [keeperId], [stackGroupId])
      const hideSet = new Set([...others.map((n) => n.id), ...hideNestedIds])
      const groupIdSet = new Set(group.map((n) => n.id))

      setNodes((nds) =>
        nds.map((n) => {
          const m = nodeStackMeta(n)
          const inGroup = findStackEntry(m, stackGroupId) || n.id === keeperId
          if (!inGroup && !hideSet.has(n.id) && !keeperNestedIds.includes(n.id)) return n

          if (hideSet.has(n.id)) {
            let meta = m
            if (findStackEntry(m, stackGroupId)) {
              const entry = {
                groupId: stackGroupId,
                index: indexById.get(n.id) ?? 99,
                expanded: false,
                ...(restoreById.get(n.id) ? { restoreAbs: restoreById.get(n.id) } : {}),
              }
              meta = rekeyGroupSide(m, stackGroupId, newSide, entry)
            }
            meta = setParentStackHidden(meta, stackGroupId)
            const { restStyle, className } = clearPreviewStyle(
              n as { style?: Record<string, unknown>; className?: string }
            )
            return {
              ...n,
              hidden: true,
              style: restStyle,
              className,
              data: {
                ...n.data,
                promptMessage: n.data?.promptMessage
                  ? { ...n.data.promptMessage, metadata: meta }
                  : n.data?.promptMessage,
              },
            }
          }

          // Keeper or keeper’s nested satellites — visible
          let meta = m
          if (groupIdSet.has(n.id) || n.id === keeperId) {
            const isKeeper = n.id === keeperId
            const entry = {
              groupId: stackGroupId,
              index: indexById.get(n.id) ?? 99,
              expanded: isKeeper,
              ...(isKeeper ? { anchor: true as const } : {}),
            }
            meta = rekeyGroupSide(m, stackGroupId, newSide, entry)
          }
          meta = setParentStackHidden(meta, null)
          const { restStyle, className } = clearPreviewStyle(
            n as { style?: Record<string, unknown>; className?: string }
          )
          return {
            ...n,
            hidden: false,
            style: restStyle,
            className,
            data: {
              ...n.data,
              promptMessage: n.data?.promptMessage
                ? { ...n.data.promptMessage, metadata: meta }
                : n.data?.promptMessage,
            },
          }
        })
      )

      try {
        const supabase = createClient()
        const persistIds = new Set([
          ...group.map((n) => n.id),
          ...hideNestedIds,
          ...keeperNestedIds,
        ])
        for (const id of persistIds) {
          const n = live.find((x) => x.id === id)
          if (!n) continue
          const msgId = nodeMessageId(n)
          if (!msgId) continue
          const { data: row } = await supabase
            .from('messages')
            .select('metadata')
            .eq('id', msgId)
            .maybeSingle()
          if (!row) continue
          let meta = (row.metadata as Record<string, unknown>) || {}
          if (hideSet.has(id)) {
            if (findStackEntry(meta, stackGroupId)) {
              const entry = {
                groupId: stackGroupId,
                index: indexById.get(id) ?? 99,
                expanded: false,
                ...(restoreById.get(id) ? { restoreAbs: restoreById.get(id) } : {}),
              }
              meta = rekeyGroupSide(meta, stackGroupId, newSide, entry)
            }
            meta = setParentStackHidden(meta, stackGroupId)
          } else {
            if (groupIdSet.has(id) || id === keeperId) {
              const isKeeper = id === keeperId
              const entry = {
                groupId: stackGroupId,
                index: indexById.get(id) ?? 99,
                expanded: isKeeper,
                ...(isKeeper ? { anchor: true as const } : {}),
              }
              meta = rekeyGroupSide(meta, stackGroupId, newSide, entry)
            }
            meta = setParentStackHidden(meta, null)
          }
          await supabase.from('messages').update({ metadata: meta }).eq('id', msgId)
        }
      } catch (err) {
        console.error('Failed to stack frames:', err)
      }
    },
    [clearPreviewOut, getNodes, nodeId, setNodes, stackGroupId, stackSide]
  )

  /** Hide all mates (+ nested satellites) — keep current host. */
  const hideMates = useCallback(() => {
    const live = getNodes()
    const mates = collectMates(getNodes, nodeId, stackGroupId)
    const nestedIds = collectNestedSatelliteIds(
      live,
      mates.map((n) => n.id),
      [stackGroupId]
    )
    const hideSet = new Set([...mates.map((n) => n.id), ...nestedIds])
    setNodes((nds) =>
      nds.map((n) => {
        if (!hideSet.has(n.id)) return n
        const m = nodeStackMeta(n)
        let meta = findStackEntry(m, stackGroupId)
          ? patchGroupEntry(m, stackGroupId, { expanded: false })
          : m
        meta = setParentStackHidden(meta, stackGroupId)
        const { restStyle, className } = clearPreviewStyle(
          n as { style?: Record<string, unknown>; className?: string }
        )
        return {
          ...n,
          hidden: true,
          style: restStyle,
          className,
          data: {
            ...n.data,
            promptMessage: n.data?.promptMessage
              ? { ...n.data.promptMessage, metadata: meta }
              : n.data?.promptMessage,
          },
        }
      })
    )
  }, [getNodes, nodeId, setNodes, stackGroupId])

  /** After fade-out — restore pre-preview open/stacked layout. */
  const commitEndPreview = useCallback(() => {
    const snap = prePreviewRef.current
    prePreviewRef.current = null
    previewPinnedRef.current = false
    setPreviewing(false)
    if (!snap || snap.length === 0) {
      hideMates()
      return
    }
    const byId = new Map(snap.map((s) => [s.id, s]))
    setNodes((nds) =>
      nds.map((n) => {
        const prev = byId.get(n.id)
        if (!prev) return n
        const m = nodeStackMeta(n)
        let meta = findStackEntry(m, stackGroupId)
          ? patchGroupEntry(m, stackGroupId, { expanded: prev.expanded })
          : m
        // Nested satellites: restore hidden via parentStackHidden when they were stacked
        if (prev.hidden && !findStackEntry(m, stackGroupId)) {
          meta = setParentStackHidden(meta, stackGroupId)
        } else if (!prev.hidden) {
          meta = setParentStackHidden(meta, null)
        }
        const { restStyle, className } = clearPreviewStyle(
          n as { style?: Record<string, unknown>; className?: string }
        )
        return {
          ...n,
          hidden: prev.hidden,
          style: prev.expanded ? { ...restStyle, opacity: 1 } : restStyle,
          className,
          zIndex: prev.expanded ? 3 : n.zIndex,
          data: {
            ...n.data,
            promptMessage: n.data?.promptMessage
              ? { ...n.data.promptMessage, metadata: meta }
              : n.data?.promptMessage,
          },
        }
      })
    )
  }, [hideMates, setNodes, stackGroupId])

  /** Fade peek out, then commit hide (unless re-hover cancels). */
  const endPreview = useCallback(() => {
    clearEndPreview()
    clearPreviewOut()
    previewPinnedRef.current = false
    // Arm fade-out on every peeking frame (thread reads tt-stack-preview-out)
    setNodes((nds) =>
      nds.map((n) => {
        const parts = (n.className || '').split(/\s+/).filter(Boolean)
        if (!parts.includes('tt-stack-preview')) return n
        if (parts.includes('tt-stack-preview-out')) return n
        return {
          ...n,
          className: cn(...parts, 'tt-stack-preview-out'),
          style: { ...(n.style || {}), pointerEvents: 'none' },
        }
      })
    )
    previewOutTimerRef.current = window.setTimeout(() => {
      previewOutTimerRef.current = null
      commitEndPreview()
    }, PREVIEW_OUT_MS)
  }, [clearEndPreview, clearPreviewOut, commitEndPreview, setNodes])

  const persistMatePatch = useCallback(
    async (
      patchForMate: (
        order: number,
        pos: { x: number; y: number },
        meta: Record<string, unknown>
      ) => Record<string, unknown>
    ) => {
      const live = getNodes()
      const host = live.find((n) => n.id === nodeId)
      if (!host) return
      const zoom = Number(String(viewportKey).split(',')[2]) || 1
      const frontAbs = absFlowPosition(host, live)
      const sortedMates = collectMates(getNodes, nodeId, stackGroupId)
      const posById = new Map<string, { x: number; y: number }>()
      sortedMates.forEach((n, order) => {
        const stamped = findStackEntry(nodeStackMeta(n), stackGroupId)?.entry.restoreAbs
        const liveAbs = absFlowPosition(n, live) // Collapse left mates put — persist that
        const onHost = Math.hypot(liveAbs.x - frontAbs.x, liveAbs.y - frontAbs.y) < 2
        posById.set(
          n.id,
          stamped && onHost
            ? stamped // Was parked on the host — write the stamped board XY
            : liveAbs
        )
      })
      const nestedIds = collectNestedSatelliteIds(
        live,
        sortedMates.map((n) => n.id),
        [stackGroupId]
      )
      const nestedPos = layoutNestedFromMates(live, new Map(posById), stackGroupId, zoom)
      for (const [id, pos] of nestedPos) {
        if (nestedIds.includes(id)) posById.set(id, pos)
      }
      const supabase = createClient()
      for (let order = 0; order < sortedMates.length; order++) {
        const mate = sortedMates[order]
        const msgId = nodeMessageId(mate)
        if (!msgId) continue
        const pos = posById.get(mate.id)
        if (!pos) continue
        const { data: row } = await supabase
          .from('messages')
          .select('metadata')
          .eq('id', msgId)
          .maybeSingle()
        if (!row) continue
        const base = (row.metadata as Record<string, unknown>) || {}
        const next = setParentStackHidden(patchForMate(order, pos, base), null)
        await supabase.from('messages').update({ metadata: next }).eq('id', msgId)
        if (entryExpanded(next, stackGroupId)) {
          await persistBlockPlacement(supabase, { messageId: msgId, position: pos })
        }
      }
      // Persist nested satellites parked with their owning mates
      for (const nid of nestedIds) {
        const n = live.find((x) => x.id === nid)
        const msgId = n ? nodeMessageId(n) : undefined
        const pos = posById.get(nid)
        if (!msgId || !pos) continue
        const { data: row } = await supabase
          .from('messages')
          .select('metadata')
          .eq('id', msgId)
          .maybeSingle()
        if (!row) continue
        const next = setParentStackHidden(
          { ...((row.metadata as Record<string, unknown>) || {}), position: pos },
          null
        )
        await supabase.from('messages').update({ metadata: next }).eq('id', msgId)
        await persistBlockPlacement(supabase, { messageId: msgId, position: pos })
      }
    },
    [getNodes, nodeId, stackGroupId, stackSide, viewportKey]
  )

  /** Eye — fully open all mates at restoreAbs; unlock so each frame drags alone. */
  const actionShowAll = useCallback(async () => {
    setMenuOpen(false)
    clearPreviewOut() // Do not finish a fade-out after we commit open
    previewPinnedRef.current = false
    prePreviewRef.current = null // Committed open — do not restore stacked hide
    setPreviewing(false)
    showMatesOut(true)
    try {
      await persistMatePatch((_order, pos, meta) => {
        let next = patchGroupEntry(meta, stackGroupId, { expanded: true })
        next = setGroupLocked(next, stackGroupId, false) // Lock frames is a separate action
        return { ...next, position: pos }
      })
    } catch (err) {
      console.error('Failed to show stacked frames:', err)
    }
  }, [clearPreviewOut, persistMatePatch, showMatesOut, stackGroupId])

  /** Lock — toggle lock on this side’s group (drag moves that tree together). */
  const actionLock = useCallback(async () => {
    setMenuOpen(false)
    previewPinnedRef.current = false
    if (previewingRef.current) endPreview() // Lock keeps the stack collapsed — hide peek
    const live = getNodes()
    const hostMeta = nodeStackMeta(live.find((n) => n.id === nodeId) || {})
    const currentlyLocked = isGroupLocked(hostMeta, stackGroupId)
    const nextLocked = !currentlyLocked
    const supabase = createClient()
    try {
      setNodes((nds) =>
        nds.map((n) => {
          const m = nodeStackMeta(n)
          if (n.id !== nodeId && !findStackEntry(m, stackGroupId)) return n
          const meta = setGroupLocked(m, stackGroupId, nextLocked)
          return {
            ...n,
            data: {
              ...n.data,
              promptMessage: n.data?.promptMessage
                ? { ...n.data.promptMessage, metadata: meta }
                : n.data?.promptMessage,
            },
          }
        })
      )
      for (const n of live) {
        const m = nodeStackMeta(n)
        if (n.id !== nodeId && !findStackEntry(m, stackGroupId)) continue
        const msgId = nodeMessageId(n)
        if (!msgId) continue
        const { data: row } = await supabase
          .from('messages')
          .select('metadata')
          .eq('id', msgId)
          .maybeSingle()
        if (!row) continue
        const meta = setGroupLocked(
          (row.metadata as Record<string, unknown>) || {},
          stackGroupId,
          nextLocked
        )
        await supabase.from('messages').update({ metadata: meta }).eq('id', msgId)
      }
    } catch (err) {
      console.error('Failed to toggle snap-lock:', err)
    }
  }, [endPreview, getNodes, nodeId, setNodes, stackGroupId])

  /** Fully open one mate from preview click — park it flush next to the host. */
  const openOneMate = useCallback(
    async (mateId: string) => {
      previewPinnedRef.current = false
      prePreviewRef.current = null // Committed — keep this mate out
      setPreviewing(false)
      clearDwell()
      clearEndPreview()
      clearPreviewOut()
      showMatesOut(true, mateId)
      try {
        const live = getNodes()
        const host = live.find((n) => n.id === nodeId)
        if (!host) return
        const zoom = Number(String(viewportKey).split(',')[2]) || 1
        const sorted = collectMates(getNodes, nodeId, stackGroupId)
        const target = sorted.find((n) => n.id === mateId)
        // Always adjacent to host (order 0), even if this mate was deeper in the stack
        const adjacentPos = target
          ? stackExpandRfAbs(host, live, stackSide, target, 0, [], zoom)
          : absFlowPosition(host, live)
        // Promote clicked mate to stackIndex 1; renumber others 2..n in prior order
        const indexById = new Map<string, number>()
        indexById.set(mateId, 1)
        let next = 2
        for (const m of sorted) {
          if (m.id === mateId) continue
          indexById.set(m.id, next++)
        }
        const supabase = createClient()
        const showNested = collectNestedSatelliteIds(live, [mateId], [stackGroupId])
        const hideMateIds = sorted.filter((n) => n.id !== mateId).map((n) => n.id)
        const hideNested = collectNestedSatelliteIds(live, hideMateIds, [stackGroupId])
        const placed = new Map<string, { x: number; y: number }>([[mateId, adjacentPos]])
        const nestedPos = layoutNestedFromMates(live, placed, stackGroupId, zoom)

        for (const mate of sorted) {
          const msgId = nodeMessageId(mate)
          if (!msgId) continue
          const isTarget = mate.id === mateId
          const { data: row } = await supabase
            .from('messages')
            .select('metadata')
            .eq('id', msgId)
            .maybeSingle()
          if (!row) continue
          let meta = patchGroupEntry(
            (row.metadata as Record<string, unknown>) || {},
            stackGroupId,
            {
              expanded: isTarget,
              index: indexById.get(mate.id) ?? 99,
            }
          )
          if (isTarget) {
            meta = setParentStackHidden({ ...meta, position: adjacentPos }, null)
            await persistBlockPlacement(supabase, {
              messageId: msgId,
              position: adjacentPos,
            })
          } else {
            meta = setParentStackHidden(meta, stackGroupId)
          }
          await supabase.from('messages').update({ metadata: meta }).eq('id', msgId)
        }
        for (const nid of showNested) {
          const n = live.find((x) => x.id === nid)
          const msgId = n ? nodeMessageId(n) : undefined
          const pos = nestedPos.get(nid)
          if (!msgId || !pos) continue
          const { data: row } = await supabase
            .from('messages')
            .select('metadata')
            .eq('id', msgId)
            .maybeSingle()
          if (!row) continue
          const meta = setParentStackHidden(
            { ...((row.metadata as Record<string, unknown>) || {}), position: pos },
            null
          )
          await supabase.from('messages').update({ metadata: meta }).eq('id', msgId)
          await persistBlockPlacement(supabase, { messageId: msgId, position: pos })
        }
        for (const nid of hideNested) {
          const n = live.find((x) => x.id === nid)
          const msgId = n ? nodeMessageId(n) : undefined
          if (!msgId) continue
          const { data: row } = await supabase
            .from('messages')
            .select('metadata')
            .eq('id', msgId)
            .maybeSingle()
          if (!row) continue
          const meta = setParentStackHidden(
            (row.metadata as Record<string, unknown>) || {},
            stackGroupId
          )
          await supabase.from('messages').update({ metadata: meta }).eq('id', msgId)
        }
      } catch (err) {
        console.error('Failed to open stacked frame:', err)
      }
    },
    [
      clearDwell,
      clearEndPreview,
      clearPreviewOut,
      getNodes,
      nodeId,
      showMatesOut,
      stackGroupId,
      stackSide,
      viewportKey,
    ]
  )

  /** Peek stays only while over the mark/menu — not while over a far restoreAbs mate. */
  const isMarkOrMenuEl = useCallback((el: Element | null) => {
    if (!el) return false
    return Boolean(el.closest?.('[data-tt-stack-reveal], [data-tt-stack-line-menu]'))
  }, [])

  /** Start fade-out once — do not reset on every pointermove (that kept the peek stuck). */
  const scheduleEndPreview = useCallback(() => {
    if (previewPinnedRef.current || menuOpenRef.current) return // Mark click / menu — keep peek
    if (endPreviewRef.current != null || previewOutTimerRef.current != null) return // Already leaving
    if (!previewingRef.current) return
    endPreview() // Immediate — no post-hover delay
  }, [endPreview])

  // While previewing: unhover mark → hide; click mate → open that frame
  useEffect(() => {
    if (!previewing) return
    const onPointerMove = (e: PointerEvent) => {
      if (previewPinnedRef.current || menuOpenRef.current) return // Pinned by mark click
      const el = document.elementFromPoint(e.clientX, e.clientY)
      if (isMarkOrMenuEl(el)) {
        clearEndPreview()
        if (previewOutTimerRef.current != null) {
          clearPreviewOut() // Cancel commit-hide
          // Replay in-anim — peek was mid fade-out
          setNodes((nds) =>
            nds.map((n) => {
              const parts = (n.className || '').split(/\s+/).filter(Boolean)
              if (!parts.includes('tt-stack-preview-out')) return n
              const { restStyle, className } = clearPreviewStyle(
                n as { style?: Record<string, unknown>; className?: string }
              )
              return {
                ...n,
                style: { ...restStyle, pointerEvents: 'all' },
                className: cn(className, 'tt-stack-preview'),
              }
            })
          )
        }
        return
      }
      scheduleEndPreview() // First move off the mark starts fade; further moves are no-ops
    }
    const onPointerDown = (e: PointerEvent) => {
      const t = e.target as HTMLElement | null
      if (!t) return
      if (t.closest?.('[data-tt-stack-reveal], [data-tt-stack-line-menu]')) return
      const rfNode = t.closest?.('.react-flow__node') as HTMLElement | null
      if (!rfNode) {
        if (previewPinnedRef.current || menuOpenRef.current) return // Menu still up
        clearEndPreview()
        endPreview()
        return
      }
      const id = rfNode.getAttribute('data-id')
      if (!id || id === nodeId || !mateIdsRef.current.has(id)) {
        if (previewPinnedRef.current || menuOpenRef.current) return
        clearEndPreview()
        endPreview()
        return
      }
      // Click previewed mate (or nested satellite) → open that owning mate + its nested pack
      e.stopPropagation()
      e.preventDefault()
      clearEndPreview()
      previewPinnedRef.current = false
      prePreviewRef.current = null // Commit — don't restore on cancel paths
      const live = getNodes()
      const mates = collectMates(getNodes, nodeId, stackGroupId)
      const owner =
        findOwningMateId(
          live,
          id,
          mates.map((m) => m.id),
          [stackGroupId]
        ) || id
      void openOneMate(owner)
    }
    document.addEventListener('pointermove', onPointerMove, true)
    document.addEventListener('pointerdown', onPointerDown, true)
    return () => {
      document.removeEventListener('pointermove', onPointerMove, true)
      document.removeEventListener('pointerdown', onPointerDown, true)
    }
  }, [
    clearEndPreview,
    clearPreviewOut,
    endPreview,
    getNodes,
    isMarkOrMenuEl,
    nodeId,
    openOneMate,
    previewing,
    scheduleEndPreview,
    setNodes,
    stackGroupId,
  ])

  // Close menu on outside click / Escape — also dismiss an uncommitted peek
  useEffect(() => {
    if (!menuOpen) return
    const dismissMenu = () => {
      setMenuOpen(false)
      previewPinnedRef.current = false
      if (previewingRef.current) endPreview() // Unhover-equivalent: hide unless they chose Open
      // Outside dismiss may leave host hover stuck after the portaled menu
      const node = document.querySelector(
        `.react-flow__node[data-id="${CSS.escape(nodeId)}"]`
      )
      if (!node?.matches(':hover')) onHoverBridge?.(false)
    }
    const onDown = (e: MouseEvent) => {
      const t = e.target as HTMLElement | null
      if (t?.closest?.('[data-tt-stack-line-menu], [data-tt-stack-reveal]')) return
      dismissMenu()
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') dismissMenu()
    }
    document.addEventListener('mousedown', onDown, true)
    document.addEventListener('keydown', onKey, true)
    return () => {
      document.removeEventListener('mousedown', onDown, true)
      document.removeEventListener('keydown', onKey, true)
    }
  }, [endPreview, menuOpen, nodeId, onHoverBridge])

  // Derive mate state after hooks (mateStateKey / dragPlaceKey force refresh)
  void mateStateKey
  void dragPlaceKey
  const mates = collectMates(getNodes, nodeId, stackGroupId)
  const nestedForLine = collectNestedSatelliteIds(
    getNodes(),
    mates.map((n) => n.id),
    [stackGroupId]
  )
  // Preview hit-tests: direct mates + nested satellites (C on A’s bottom, etc.)
  mateIdsRef.current = new Set([...mates.map((n) => n.id), ...nestedForLine])
  const allOpen =
    mates.length > 0 &&
    mates.every((n) => {
      const m = nodeStackMeta(n)
      return entryExpanded(m, stackGroupId) && !n.hidden
    }) &&
    nestedForLine.every((id) => {
      const n = getNodes().find((x) => x.id === id)
      return n && !n.hidden
    })
  const hostNode = getNodes().find((n) => n.id === nodeId)
  const isLocked =
    isGroupLocked(nodeStackMeta(hostNode || {}), stackGroupId) ||
    mates.some((n) => isGroupLocked(nodeStackMeta(n), stackGroupId))

  /** Snapshot + faded peek at restoreAbs (shared by hover dwell and mark click). */
  const beginPreview = () => {
    clearPreviewOut() // Cancel mid fade-out if the pointer returned
    if (previewingRef.current) {
      // Re-enter during out: strip out class and replay in-anim
      setNodes((nds) =>
        nds.map((n) => {
          const parts = (n.className || '').split(/\s+/).filter(Boolean)
          if (!parts.includes('tt-stack-preview-out')) return n
          const { restStyle, className } = clearPreviewStyle(
            n as { style?: Record<string, unknown>; className?: string }
          )
          return {
            ...n,
            style: { ...restStyle, pointerEvents: 'all' },
            className: cn(className, 'tt-stack-preview'),
          }
        })
      )
      return true
    }
    const live = collectMates(getNodes, nodeId, stackGroupId)
    const nested = collectNestedSatelliteIds(
      getNodes(),
      live.map((n) => n.id),
      [stackGroupId]
    )
    const stacked = live.filter((n) => {
      if (n.hidden) return true
      const m = nodeStackMeta(n)
      return !entryExpanded(m, stackGroupId)
    })
    const nestedStacked = nested.filter((id) => {
      const n = getNodes().find((x) => x.id === id)
      return !n || n.hidden === true
    })
    if (stacked.length === 0 && nestedStacked.length === 0) return false
    const snapNodes = [
      ...live,
      ...nested.map((id) => getNodes().find((x) => x.id === id)).filter(Boolean),
    ] as typeof live
    prePreviewRef.current = snapNodes.map((n) => {
      const m = nodeStackMeta(n)
      return {
        id: n.id,
        expanded: entryExpanded(m, stackGroupId),
        hidden: n.hidden === true,
      }
    })
    setPreviewing(true)
    showMatesOut(false) // Faded original frame + thread
    return true
  }

  const onEnter = () => {
    if (menuOpen) return
    clearEndPreview()
    if (previewingRef.current) return // Already showing preview — stay
    clearDwell()
    dwellRef.current = window.setTimeout(() => {
      beginPreview()
    }, HOVER_DWELL_MS)
  }

  // Leaving the mark: hide peek unless the sim-point was clicked (menu pinned)
  const onLinePointerLeave = () => {
    clearDwell()
    if (!previewingRef.current) return
    if (previewPinnedRef.current || menuOpenRef.current) return
    scheduleEndPreview()
  }

  const onClickLine = (e: React.MouseEvent) => {
    e.stopPropagation()
    e.preventDefault()
    clearDwell()
    clearEndPreview()
    const rect = e.currentTarget.getBoundingClientRect()
    setMenuPos({
      x: rect ? rect.left + rect.width / 2 : e.clientX,
      y: rect ? rect.top : e.clientY,
    })
    if (menuOpenRef.current) {
      // Second click closes menu — hide uncommitted peek
      previewPinnedRef.current = false
      setMenuOpen(false)
      if (previewingRef.current) endPreview()
      return
    }
    // Mark click: pin peek so unhover does not hide while the menu is up
    beginPreview()
    previewPinnedRef.current = true
    setMenuOpen(true)
  }

  const onWheelLine = (e: React.WheelEvent<HTMLButtonElement>) => {
    e.preventDefault() // Portaled line must never scroll/zoom the browser window
    e.stopPropagation()
    const ownerNode = document.querySelector(
      `.react-flow__node[data-id="${CSS.escape(nodeId)}"]`
    ) as HTMLElement | null
    const flowRoot = ownerNode?.closest('.react-flow') as HTMLElement | null
    const pane = flowRoot?.querySelector('.react-flow__pane') as HTMLElement | null
    const target = pane || flowRoot
    if (!target) return
    target.dispatchEvent(
      new WheelEvent('wheel', {
        bubbles: true,
        cancelable: true,
        clientX: e.clientX,
        clientY: e.clientY,
        deltaX: e.deltaX,
        deltaY: e.deltaY,
        deltaZ: e.deltaZ,
        deltaMode: e.deltaMode,
        ctrlKey: e.ctrlKey,
        metaKey: e.metaKey,
        shiftKey: e.shiftKey,
        altKey: e.altKey,
      })
    )
  }

  if (mates.length === 0) return null

  // This gap's "outward" count = mates further out than this frame
  const myIndex = (() => {
    const self = getNodes().find((n) => n.id === nodeId)
    return self ? stackIndexOf(self, stackGroupId) : 0
  })()
  const outwardMates = mates
    .filter((n) => stackIndexOf(n, stackGroupId) > myIndex)
    .sort((a, b) => stackIndexOf(a, stackGroupId) - stackIndexOf(b, stackGroupId))
  const nextOutId = outwardMates[0]?.id as string | undefined
  mateIdRef.current = nextOutId || '' // Drag ticks read this without scanning every frame
  void viewportKey // Still drives showMatesOut zoom; mark itself rides RF viewport via CSS
  void dragPlaceKey // Re-render while a mate moves (preview / open)
  void gapThread // Keeps store subscription warm for thread-pair peek / paint rules elsewhere
  const arrowDeg = stackArrowDegrees(stackSide) // Tip toward the stacked mate
  // Menu stack-direction icons (inward = under this frame, outward = under the mate)
  const InwardIcon =
    stackSide === 'right'
      ? ArrowLeft
      : stackSide === 'left'
        ? ArrowRight
        : stackSide === 'bottom'
          ? ArrowUp
          : ArrowDown
  const OutwardIcon =
    stackSide === 'right'
      ? ArrowRight
      : stackSide === 'left'
        ? ArrowLeft
        : stackSide === 'bottom'
          ? ArrowDown
          : ArrowUp
  const stackBtnClass =
    'flex h-8 w-8 items-center justify-center rounded-md text-gray-700 hover:bg-gray-100 dark:text-gray-200 dark:hover:bg-gray-800'

  // Stay hit-able while the menu is open even if the frame lost hover/select mid-fade
  const markVisible = visible || menuOpen

  // Rounded triangle in sim-point blue + white rim — same paint language as ConnectionIndicator
  return (
    <>
      <button
        type="button"
        data-tt-stack-reveal={stackSide}
        data-tt-stack-reveal-visible={markVisible ? '' : undefined} // CSS opacity fade in/out
        className="nodrag nopan absolute z-[40] flex cursor-pointer items-center justify-center border-0 bg-transparent p-0 text-blue-500 hover:text-blue-600"
        title="Stack"
        aria-label="Stack menu"
        aria-expanded={menuOpen}
        aria-hidden={!markVisible}
        tabIndex={markVisible ? 0 : -1}
        onMouseDown={(e) => e.stopPropagation()} // Do not start a frame drag or select the thread
        onMouseEnter={(e) => {
          if (!markVisible) return // Mid fade-out — ignore
          onHoverBridge?.(true) // Host may show this mark only while hovering
          onEnter(e)
        }}
        onMouseLeave={onLinePointerLeave}
        onClick={markVisible ? onClickLine : undefined}
        onWheel={onWheelLine}
      >
        <svg
          width={13} // A step above 10px discs so the triangle still reads clearly
          height={13}
          viewBox="0 0 13 13"
          aria-hidden
          style={{ transform: `rotate(${arrowDeg}deg)`, overflow: 'visible' }}
        >
          {/* Rounded tip + rear corners */}
          <path
            d="M 3.5 2.1
               L 9.2 5.3
               Q 11.5 6.5 9.2 7.7
               L 3.5 10.9
               Q 1.5 12 1.5 9.8
               L 1.5 3.2
               Q 1.5 1 3.5 2.1
               Z"
            fill="currentColor" // blue-500 / hover blue-600
            stroke="#ffffff" // Same white rim as connection-indicator discs
            strokeWidth={1.5}
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        </svg>
      </button>

      {menuOpen &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            data-tt-stack-line-menu
            role="menu"
            className="fixed z-[1000] flex items-center gap-0.5 rounded-lg border border-gray-200 bg-white p-1 shadow-lg dark:border-[#2f2f2f] dark:bg-[#1f1f1f]"
            onMouseEnter={() => onHoverBridge?.(true)} // Portaled — panel leave would clear hover
            onMouseLeave={(e) => {
              const to = e.relatedTarget as HTMLElement | null
              if (to?.closest?.('[data-tt-stack-reveal]')) return
              const node = document.querySelector(
                `.react-flow__node[data-id="${CSS.escape(nodeId)}"]`
              )
              if (node && to && node.contains(to)) return
              onHoverBridge?.(false)
            }}
            style={{
              left: menuPos.x,
              top: menuPos.y,
              transform: 'translate(-50%, calc(-100% - 8px))',
            }}
            onMouseDown={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              role="menuitem"
              className={cn(
                'flex h-8 items-center gap-1.5 rounded-md px-2 text-sm text-gray-700 hover:bg-gray-100 dark:text-gray-200 dark:hover:bg-gray-800',
                allOpen && 'tt-selected text-blue-500 dark:text-blue-400'
              )}
              title="Open stack"
              aria-label="Open stack"
              onClick={() => void actionShowAll()}
            >
              <Eye className="h-4 w-4" />
              <span>Open stack</span>
            </button>
            <button
              type="button"
              role="menuitem"
              className={stackBtnClass}
              title="Stack under this frame"
              aria-label="Stack under this frame"
              onClick={() => void actionStackUnder(nodeId)}
            >
              <InwardIcon className="h-4 w-4" />
            </button>
            {nextOutId && (
              <button
                type="button"
                role="menuitem"
                className={stackBtnClass}
                title="Stack under the other frame"
                aria-label="Stack under the other frame"
                onClick={() => void actionStackUnder(nextOutId)}
              >
                <OutwardIcon className="h-4 w-4" />
              </button>
            )}
            <button
              type="button"
              role="menuitem"
              className={cn(
                'flex h-8 items-center gap-1.5 rounded-md px-2 text-sm text-gray-700 hover:bg-gray-100 dark:text-gray-200 dark:hover:bg-gray-800',
                isLocked && 'tt-selected text-blue-500 dark:text-blue-400'
              )}
              title={isLocked ? 'Unlock' : 'Lock'}
              aria-label={isLocked ? 'Unlock' : 'Lock'}
              onClick={() => void actionLock()}
            >
              <Lock className="h-4 w-4" />
              <span>Lock</span>
            </button>
          </div>,
          document.body
        )}
    </>
  )
}
