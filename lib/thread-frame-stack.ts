// Thread-scoped frame stack — Open / Stack under / Lock for a threaded frame–frame pair.
// Edge-snap only aligns; these actions create the sideStacks pair from the thread menu.

import type { Edge, Node } from 'reactflow'
import { createClient } from '@/lib/supabase/client'
import { persistBlockPlacement } from '@/lib/blocks'
import { absFlowPosition } from '@/components/use-block-group-drag'
import {
  stackExpandRfAbs,
  absToNodePosition,
} from '@/components/use-frame-nest-stack-drag'
import { frameAdjustFlowBox } from '@/lib/frame-adjust-box'
import {
  type FrameStackSide,
  findStackEntry,
  isGroupLocked,
  patchGroupEntry,
  rekeyGroupSide,
  setGroupLocked,
  setParentStackHidden,
  setSideStackEntry,
  stackIndexInGroup,
} from '@/lib/frame-side-stacks'
import { oppositeStackSide } from '@/lib/frame-stack-line'

/** Stable group id for the stack pair owned by this thread. */
export function threadStackGroupId(edgeId: string): string {
  return `thread:${edgeId}`
}

function nodeMeta(n: Node): Record<string, unknown> {
  return ((n.data as { promptMessage?: { metadata?: unknown } } | undefined)?.promptMessage
    ?.metadata || {}) as Record<string, unknown>
}

function nodeMessageId(n: Node): string | undefined {
  const id = (n.data as { promptMessage?: { id?: string } } | undefined)?.promptMessage?.id
  return typeof id === 'string' ? id : undefined
}

/** True when both thread ends are board frames (chatPanel). */
export function threadConnectsTwoFrames(
  edge: Pick<Edge, 'source' | 'target'>,
  nodes: Node[]
): boolean {
  const a = nodes.find((n) => n.id === edge.source)
  const b = nodes.find((n) => n.id === edge.target)
  return a?.type === 'chatPanel' && b?.type === 'chatPanel'
}

/**
 * Side of `from` that faces `toward` (adjust-box centers).
 * Used as the keeper’s outward stack side when stacking under `from`.
 */
export function inferFacingStackSide(
  from: Node,
  toward: Node,
  live: Node[],
  zoom: number
): FrameStackSide {
  const a = frameAdjustFlowBox(from, live, zoom)
  const b = frameAdjustFlowBox(toward, live, zoom)
  const acx = a.x + a.width / 2
  const acy = a.y + a.height / 2
  const bcx = b.x + b.width / 2
  const bcy = b.y + b.height / 2
  const dx = bcx - acx
  const dy = bcy - acy
  if (Math.abs(dx) >= Math.abs(dy)) return dx >= 0 ? 'right' : 'left'
  return dy >= 0 ? 'bottom' : 'top'
}

type SetNodes = (updater: (nodes: Node[]) => Node[]) => void

export type ThreadStackCtx = {
  edgeId: string
  sourceId: string
  targetId: string
  getNodes: () => Node[]
  setNodes: SetNodes
  zoom: number
}

/** Read whether this thread’s frame pair is snap-locked. */
export function isThreadPairStackLocked(ctx: ThreadStackCtx): boolean {
  const gid = threadStackGroupId(ctx.edgeId)
  const live = ctx.getNodes()
  for (const id of [ctx.sourceId, ctx.targetId]) {
    const n = live.find((x) => x.id === id)
    if (n && isGroupLocked(nodeMeta(n), gid)) return true
  }
  return false
}

/** True when at least one of the pair is collapsed under the other. */
export function isThreadPairStacked(ctx: ThreadStackCtx): boolean {
  const gid = threadStackGroupId(ctx.edgeId)
  const live = ctx.getNodes()
  for (const id of [ctx.sourceId, ctx.targetId]) {
    const n = live.find((x) => x.id === id)
    if (!n) continue
    const e = findStackEntry(nodeMeta(n), gid)?.entry
    if (e && e.expanded === false) return true
    if (n.hidden && findStackEntry(nodeMeta(n), gid)) return true
  }
  return false
}

/** Ensure both frames belong to this thread’s stack group (visible, unlocked stamp). */
function ensurePairMembership(
  live: Node[],
  gid: string,
  keeperId: string,
  otherId: string,
  side: FrameStackSide
): Map<string, Record<string, unknown>> {
  const metaById = new Map<string, Record<string, unknown>>()
  for (const id of [keeperId, otherId]) {
    const n = live.find((x) => x.id === id)
    if (!n) continue
    const isKeeper = id === keeperId
    const entry = {
      groupId: gid,
      index: isKeeper ? 0 : 1,
      expanded: true,
      ...(isKeeper ? { anchor: true as const } : {}),
    }
    metaById.set(id, setSideStackEntry(nodeMeta(n), side, entry))
  }
  return metaById
}

async function persistMetaForNodes(
  live: Node[],
  ids: string[],
  metaById: Map<string, Record<string, unknown>>
): Promise<void> {
  const supabase = createClient()
  for (const id of ids) {
    const n = live.find((x) => x.id === id)
    const msgId = n ? nodeMessageId(n) : undefined
    const meta = metaById.get(id)
    if (!msgId || !meta) continue
    const { data: row } = await supabase
      .from('messages')
      .select('metadata')
      .eq('id', msgId)
      .maybeSingle()
    if (!row) continue
    // Merge on DB row so concurrent keys survive
    const base = (row.metadata as Record<string, unknown>) || {}
    const merged = { ...base, ...meta }
    // Prefer stack fields from our computed meta
    if (meta.sideStacks) merged.sideStacks = meta.sideStacks
    if (meta.snapLockedGroupIds) merged.snapLockedGroupIds = meta.snapLockedGroupIds
    else delete merged.snapLockedGroupIds
    if ('parentStackHidden' in meta) {
      if (meta.parentStackHidden) merged.parentStackHidden = meta.parentStackHidden
      else delete merged.parentStackHidden
    }
    if (meta.position) merged.position = meta.position
    await supabase.from('messages').update({ metadata: merged }).eq('id', msgId)
  }
}

/**
 * Stack under `keeperId` — keeper stays visible; the other frame hides on the keeper.
 * Parks the hidden mate at fill-mid + natural gap. Does **not** lock — only Lock frames moves both.
 */
export async function stackUnderThreadFrame(
  ctx: ThreadStackCtx,
  keeperId: string
): Promise<void> {
  const otherId = keeperId === ctx.sourceId ? ctx.targetId : ctx.sourceId
  if (keeperId !== ctx.sourceId && keeperId !== ctx.targetId) return
  const live = ctx.getNodes()
  const keeper = live.find((n) => n.id === keeperId)
  const other = live.find((n) => n.id === otherId)
  if (!keeper || !other || keeper.type !== 'chatPanel' || other.type !== 'chatPanel') return

  const gid = threadStackGroupId(ctx.edgeId)
  const side = inferFacingStackSide(keeper, other, live, ctx.zoom)
  // Stamp pre-stack XY so Open stack can restore the same thread geometry
  const restoreAbs = absFlowPosition(other, live)
  // Park other relative to keeper on that side (order 0) — invisible bookkeeping only
  const parkAbs = stackExpandRfAbs(keeper, live, side, other, 0, [], ctx.zoom)
  const parkNodePos = absToNodePosition(other, parkAbs, live)

  const keeperEntry = {
    groupId: gid,
    index: 0,
    anchor: true as const,
    expanded: true,
  }
  const otherEntry = {
    groupId: gid,
    index: 1,
    expanded: false,
    restoreAbs, // Open stack puts the mate back here
  }

  ctx.setNodes((nds) =>
    nds.map((n) => {
      if (n.id === keeperId) {
        let meta = rekeyGroupSide(nodeMeta(n), gid, side, keeperEntry)
        meta = setParentStackHidden(meta, null) // Keeper stays visible
        return {
          ...n,
          hidden: false,
          data: {
            ...n.data,
            promptMessage: n.data?.promptMessage
              ? { ...n.data.promptMessage, metadata: meta }
              : n.data?.promptMessage,
          },
        }
      }
      if (n.id === otherId) {
        let meta = rekeyGroupSide(nodeMeta(n), gid, side, otherEntry)
        meta = setParentStackHidden(meta, gid) // Collapsed under this thread stack
        meta = { ...meta, position: parkAbs }
        return {
          ...n,
          position: parkNodePos,
          hidden: true,
          data: {
            ...n.data,
            promptMessage: n.data?.promptMessage
              ? { ...n.data.promptMessage, metadata: meta }
              : n.data?.promptMessage,
          },
        }
      }
      return n
    })
  )

  try {
    const metaById = new Map<string, Record<string, unknown>>()
    metaById.set(
      keeperId,
      setParentStackHidden(rekeyGroupSide(nodeMeta(keeper), gid, side, keeperEntry), null)
    )
    metaById.set(otherId, {
      ...setParentStackHidden(rekeyGroupSide(nodeMeta(other), gid, side, otherEntry), gid),
      position: parkAbs,
    })
    await persistMetaForNodes(live, [keeperId, otherId], metaById)
    const msgId = nodeMessageId(other)
    if (msgId) {
      const supabase = createClient()
      await persistBlockPlacement(supabase, { messageId: msgId, position: parkAbs })
    }
  } catch (err) {
    console.error('Failed to stack frames under thread:', err)
  }
}

/**
 * Open stack — both frames visible at pre-stack XY (`restoreAbs`) so the thread
 * looks as it did before Stack under. Unlocks the pair (Lock frames is separate).
 */
export async function openThreadStack(ctx: ThreadStackCtx): Promise<void> {
  const live = ctx.getNodes()
  const source = live.find((n) => n.id === ctx.sourceId)
  const target = live.find((n) => n.id === ctx.targetId)
  if (!source || !target) return

  const gid = threadStackGroupId(ctx.edgeId)
  // Prefer current anchor; else source as keeper for layout
  const sourceEntry = findStackEntry(nodeMeta(source), gid)
  const targetEntry = findStackEntry(nodeMeta(target), gid)
  const keeperId =
    sourceEntry?.entry.anchor || stackIndexInGroup(nodeMeta(source), gid) === 0
      ? ctx.sourceId
      : targetEntry?.entry.anchor || stackIndexInGroup(nodeMeta(target), gid) === 0
        ? ctx.targetId
        : ctx.sourceId
  const mateId = keeperId === ctx.sourceId ? ctx.targetId : ctx.sourceId
  const keeper = live.find((n) => n.id === keeperId)!
  const mate = live.find((n) => n.id === mateId)!
  const side =
    findStackEntry(nodeMeta(keeper), gid)?.side ||
    inferFacingStackSide(keeper, mate, live, ctx.zoom)

  const stamped = ensurePairMembership(live, gid, keeperId, mateId, side)
  // Prefer stamped pre-stack XY so the thread returns as it was; else adjacent park
  const mateRestore = findStackEntry(nodeMeta(mate), gid)?.entry.restoreAbs
  const openAbs =
    mateRestore || stackExpandRfAbs(keeper, live, side, mate, 0, [], ctx.zoom)
  const openNodePos = absToNodePosition(mate, openAbs, live)

  ctx.setNodes((nds) =>
    nds.map((n) => {
      if (n.id === keeperId) {
        let meta = patchGroupEntry(stamped.get(keeperId) || nodeMeta(n), gid, {
          expanded: true,
          anchor: true,
          index: 0,
        })
        meta = setGroupLocked(meta, gid, false) // Open → independently draggable
        meta = setParentStackHidden(meta, null)
        return {
          ...n,
          hidden: false,
          data: {
            ...n.data,
            promptMessage: n.data?.promptMessage
              ? { ...n.data.promptMessage, metadata: meta }
              : n.data?.promptMessage,
          },
        }
      }
      if (n.id === mateId) {
        let meta = patchGroupEntry(stamped.get(mateId) || nodeMeta(n), gid, {
          expanded: true,
          index: 1,
        })
        meta = setGroupLocked(meta, gid, false)
        meta = setParentStackHidden(meta, null)
        meta = { ...meta, position: openAbs }
        return {
          ...n,
          position: openNodePos,
          hidden: false,
          data: {
            ...n.data,
            promptMessage: n.data?.promptMessage
              ? { ...n.data.promptMessage, metadata: meta }
              : n.data?.promptMessage,
          },
        }
      }
      return n
    })
  )

  try {
    const metaById = new Map<string, Record<string, unknown>>()
    metaById.set(
      keeperId,
      setParentStackHidden(
        setGroupLocked(
          patchGroupEntry(stamped.get(keeperId) || nodeMeta(keeper), gid, {
            expanded: true,
            anchor: true,
            index: 0,
          }),
          gid,
          false
        ),
        null
      )
    )
    metaById.set(mateId, {
      ...setParentStackHidden(
        setGroupLocked(
          patchGroupEntry(stamped.get(mateId) || nodeMeta(mate), gid, {
            expanded: true,
            index: 1,
          }),
          gid,
          false
        ),
        null
      ),
      position: openAbs,
    })
    await persistMetaForNodes(live, [keeperId, mateId], metaById)
    const msgId = nodeMessageId(mate)
    if (msgId) {
      const supabase = createClient()
      await persistBlockPlacement(supabase, { messageId: msgId, position: openAbs })
    }
  } catch (err) {
    console.error('Failed to open thread stack:', err)
  }
}

/** Toggle snap-lock on this thread’s frame pair (rigid drag together). */
export async function toggleThreadStackLock(ctx: ThreadStackCtx): Promise<void> {
  const live = ctx.getNodes()
  const gid = threadStackGroupId(ctx.edgeId)
  const source = live.find((n) => n.id === ctx.sourceId)
  const target = live.find((n) => n.id === ctx.targetId)
  if (!source || !target) return

  const currentlyLocked =
    isGroupLocked(nodeMeta(source), gid) || isGroupLocked(nodeMeta(target), gid)
  const nextLocked = !currentlyLocked

  // Ensure membership so lock has a group to attach to
  const side =
    findStackEntry(nodeMeta(source), gid)?.side ||
    findStackEntry(nodeMeta(target), gid)?.side ||
    inferFacingStackSide(source, target, live, ctx.zoom)
  const stamped = ensurePairMembership(live, gid, ctx.sourceId, ctx.targetId, side)

  ctx.setNodes((nds) =>
    nds.map((n) => {
      if (n.id !== ctx.sourceId && n.id !== ctx.targetId) return n
      const base = stamped.get(n.id) || nodeMeta(n)
      const meta = setGroupLocked(base, gid, nextLocked)
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

  try {
    const metaById = new Map<string, Record<string, unknown>>()
    for (const id of [ctx.sourceId, ctx.targetId]) {
      const base = stamped.get(id) || nodeMeta(live.find((n) => n.id === id)!)
      metaById.set(id, setGroupLocked(base, gid, nextLocked))
    }
    await persistMetaForNodes(live, [ctx.sourceId, ctx.targetId], metaById)
  } catch (err) {
    console.error('Failed to toggle thread stack lock:', err)
  }
}

/** Arrow direction hint: side of source that faces target. */
export function threadStackArrowSide(
  edge: Pick<Edge, 'source' | 'target'>,
  nodes: Node[],
  zoom: number
): FrameStackSide {
  const a = nodes.find((n) => n.id === edge.source)
  const b = nodes.find((n) => n.id === edge.target)
  if (!a || !b) return 'right'
  return inferFacingStackSide(a, b, nodes, zoom)
}

export { oppositeStackSide }
