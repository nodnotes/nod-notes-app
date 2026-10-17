import type { Node } from 'reactflow'
import { frameAdjustFlowBox, nominalAdjustChromeInsets } from '../frame-adjust-box.ts'
import { stackConnectionOutsetFlow, facingConnectionExitFlow } from '../frame-stack-line.ts'
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
        metadata: {
          sideStacks: { right: { groupId: 'g', index, anchor } },
          resizeDimensions: { width: 100, height: 80 }, // Fill size — select may bake chrome into RF width
        },
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
const outset = stackConnectionOutsetFlow(zoom)
const empty = { x: 0, yTop: 0, yBottom: 0 }
const aChrome = nominalAdjustChromeInsets({}, zoom, false)
const bChrome = nominalAdjustChromeInsets({}, zoom, false)
const aExit = facingConnectionExitFlow(abox, 'right', outset, aChrome)
const bExit = facingConnectionExitFlow(bbox, 'left', outset, bChrome)
const gapX = (aExit.x + bExit.x) / 2
const gapY = (aExit.y + bExit.y) / 2
if (Math.abs(midX - gapX) > 0.01) throw new Error(`x ${midX} != ${gapX}`)
if (Math.abs(midY - gapY) > 0.01) throw new Error(`y ${midY} != ${gapY}`)
const tipX = nums[2]
const backX = nums[0]
if (tipX <= backX) throw new Error('arrow should point at the target')
if (stackedThreadArrow(a, c, zoom, head)) throw new Error('skipped frame should keep a tail')
if (stackedThreadArrow(a, lone, zoom, head)) throw new Error('different group should keep a tail')

// Upright select must not move the adjust box / stack gap (RF XY stays fill origin).
const chrome = aChrome
const aSelSized = {
  ...a,
  selected: true,
  width: (a.width ?? 100) + chrome.x * 2,
  height: (a.height ?? 80) + chrome.yTop + chrome.yBottom,
} as Node
const bSelSized = {
  ...b,
  selected: true,
  width: (b.width ?? 100) + chrome.x * 2,
  height: (b.height ?? 80) + chrome.yTop + chrome.yBottom,
} as Node
// Select often flips before RF width/height include chrome — must still match idle geometry
const aSelLag = { ...a, selected: true } as Node
const bSelLag = { ...b, selected: true } as Node
const idleGap = { x: gapX, y: gapY }
for (const [label, left, right] of [
  ['a-selected', aSelSized, b],
  ['b-selected', a, bSelSized],
  ['both-selected', aSelSized, bSelSized],
  ['a-select-lag', aSelLag, b],
  ['b-select-lag', a, bSelLag],
] as const) {
  const lb = frameAdjustFlowBox(left, [left, right], zoom)
  const rb = frameAdjustFlowBox(right, [left, right], zoom)
  const lx = facingConnectionExitFlow(lb, 'right', outset, aChrome).x
  const rx = facingConnectionExitFlow(rb, 'left', outset, bChrome).x
  const g = (lx + rx) / 2
  if (Math.abs(g - idleGap.x) > 0.01) throw new Error(`${label} gap moved: ${g} vs ${idleGap.x}`)
  if (Math.abs(lb.x - abox.x) > 0.01 || Math.abs(lb.width - abox.width) > 0.01) {
    throw new Error(`${label} left adjust box moved`)
  }
  if (Math.abs(rb.x - bbox.x) > 0.01 || Math.abs(rb.width - bbox.width) > 0.01) {
    throw new Error(`${label} right adjust box moved`)
  }
}

void empty
console.log('ok', { gapX, gapY, midX, midY, aExit, bExit })
