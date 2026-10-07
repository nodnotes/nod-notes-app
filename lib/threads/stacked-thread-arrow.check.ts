import type { Node } from 'reactflow'
import { frameAdjustFlowBox } from '../frame-adjust-box.ts'
import { stackedThreadArrow } from './stacked-thread-arrow.ts'

function frame(
  id: string,
  x: number,
  index: number,
  anchor = false
): Node {
  return {
    id,
    type: 'chatPanel',
    position: { x, y: 0 },
    width: 100,
    height: 80,
    data: {
      promptMessage: {
        metadata: { sideStacks: { right: { groupId: 'g', index, anchor } } },
      },
    },
  } as Node
}

const a = frame('a', 0, 0, true)
const b = frame('b', 158, 1)
const c = frame('c', 400, 2)
const lone = frame('z', 158, 1)
;(lone.data as { promptMessage: { metadata: { sideStacks: { right: { groupId: string } } } } }).promptMessage.metadata.sideStacks.right.groupId = 'other'

const zoom = 1
const head = 8
const hit = stackedThreadArrow(a, b, zoom, head)
if (!hit) throw new Error('expected head')
const nums = hit.points.split(/[ ,]/).map(Number)
const xs = [nums[0], nums[2], nums[4]]
const ys = [nums[1], nums[3], nums[5]]
const midX = (Math.min(...xs) + Math.max(...xs)) / 2
const midY = (Math.min(...ys) + Math.max(...ys)) / 2
const abox = frameAdjustFlowBox(a, [a, b], zoom)
const bbox = frameAdjustFlowBox(b, [a, b], zoom)
const gapX = bbox.x - 14 * 1.4 // Connection-point distance outside the target's left edge
const top = Math.max(abox.y, bbox.y)
const bot = Math.min(abox.y + abox.height, bbox.y + bbox.height)
const gapY = (top + bot) / 2
if (Math.abs(midX - gapX) > 0.01) throw new Error(`x ${midX} != ${gapX}`)
if (Math.abs(midY - gapY) > 0.01) throw new Error(`y ${midY} != ${gapY}`)
const tipX = nums[2]
const backX = nums[0]
if (tipX <= backX) throw new Error('arrow should point at the target')
if (stackedThreadArrow(a, c, zoom, head)) throw new Error('skipped frame should keep a tail')
if (stackedThreadArrow(a, lone, zoom, head)) throw new Error('different group should keep a tail')
console.log('ok', { gapX, gapY, midX, midY })
