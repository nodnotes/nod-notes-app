// A thread between two frames that sit next to each other in a side stack
// draws only the arrow head, centered in the gap between their adjust boxes.

import type { Node } from 'reactflow'
import { frameAdjustFlowBox, type FlowBox } from '@/lib/frame-adjust-box'
import { stackGapMarkPoint } from '@/lib/frame-stack-line' // Same spot as the unthreaded diamond
import { INDICATOR_OUTSET } from '@/components/threads/handle-ids' // Connection-point distance from the adjust edge
import { frameScreenChromeScale } from '@/components/threads/constants' // Screen-constant, matching the blue dots
import {
  FRAME_STACK_SIDES,
  readSideStacks,
  type FrameStackSide,
} from '@/lib/frame-side-stacks'

export type StackedThreadArrow = {
  points: string // Closed arrow polyline in flow px
  hitPath: string // Invisible stroke so the thread stays selectable
}

function frameMeta(node: Node): Record<string, unknown> {
  const data = node.data as { promptMessage?: { metadata?: Record<string, unknown> } } | undefined
  return data?.promptMessage?.metadata ?? {} // Same metadata the stack trees are stored on
}

function stackIndex(entry: { anchor?: boolean; index: number }): number {
  return entry.anchor ? 0 : entry.index // The anchor is the root of that side's tree
}

/** Side where the two frames are neighbors in one stack tree, or null. */
function adjacentStackSide(source: Node, target: Node): FrameStackSide | null {
  const a = readSideStacks(frameMeta(source)) // This frame's four side trees
  const b = readSideStacks(frameMeta(target))
  for (const side of FRAME_STACK_SIDES) {
    const ea = a[side]
    const eb = b[side]
    if (!ea || !eb || ea.groupId !== eb.groupId) continue // Not the same stack on this side
    if (Math.abs(stackIndex(ea) - stackIndex(eb)) !== 1) continue // Another frame sits between them
    return side
  }
  return null
}

function boxCenter(box: FlowBox): { x: number; y: number } {
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 }
}

/**
 * Head-only geometry when the thread's frames are adjacent in a stack.
 * `head` is the flow length other thread arrows already use.
 */
export function stackedThreadArrow(
  source: Node | undefined,
  target: Node | undefined,
  zoom: number,
  head: number
): StackedThreadArrow | null {
  if (!source || !target) return null // Thread still connecting
  if (source.type !== 'chatPanel' || target.type !== 'chatPanel') return null // Drawings keep a full thread
  if (source.hidden || target.hidden) return null // Collapsed mate has no gap to sit in
  const side = adjacentStackSide(source, target)
  if (!side) return null
  const live = [source, target] // Root frames; parent lookup only needs these two
  const src = frameAdjustFlowBox(source, live, zoom) // Blue box, including unselected chrome
  const tgt = frameAdjustFlowBox(target, live, zoom)
  const srcC = boxCenter(src)
  const tgtC = boxCenter(tgt)
  const anchorNode = source.selected ? source : target // Blue ring when one frame is selected; otherwise the arrival frame
  const anchor = anchorNode === source ? src : tgt
  const other = anchor === src ? tgt : src
  const outset = INDICATOR_OUTSET * frameScreenChromeScale(zoom) // Flow px — screen distance matches the blue dots
  const at = stackGapMarkPoint(anchor, other, side, outset) // Connection point on the facing side, between the frames
  let cx = at.x
  let cy = at.y
  let dx = 0
  let dy = 0
  if (side === 'left' || side === 'right') {
    dx = tgtC.x >= srcC.x ? 1 : -1 // Head points at the target frame
    dy = 0
  } else {
    dx = 0
    dy = tgtC.y >= srcC.y ? 1 : -1
  }
  const len = Math.max(0, head) // Back of the head to the tip
  const wing = len * 0.8 // Marker polyline uses a 4:5 wing (−4 over a length of 5)
  const px = -dy // Perpendicular, for the two wings
  const py = dx
  const tipX = cx + dx * (len / 2) // Tip sits half a head past the gap center
  const tipY = cy + dy * (len / 2)
  const backX = cx - dx * (len / 2) // Back of the head is the other half
  const backY = cy - dy * (len / 2)
  const wingAx = backX + px * wing
  const wingAy = backY + py * wing
  const wingBx = backX - px * wing
  const wingBy = backY - py * wing
  return {
    points: `${wingAx},${wingAy} ${tipX},${tipY} ${wingBx},${wingBy} ${wingAx},${wingAy}`,
    hitPath: `M ${backX} ${backY} L ${tipX} ${tipY}`, // Covers the head so the thread can still be selected
  }
}
