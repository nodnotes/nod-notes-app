import type { Node } from 'reactflow'

/** Persisted on `messages.metadata` — RF array index before this cover node. */
export const IBAR_STACK_BEFORE_NODE_ID = 'ibarStackBeforeNodeId'

/** Where to insert an I-bar spawn so it paints under frames already covering this flow point. */
export type IbarSpawnStackPlan = {
  insertIndex: number // Index in the nodes array — before the top cover at this point
  zIndex: number // One below the cover's RF `zIndex` when that inline value is > 0
}

/** Screen point inside rect (inclusive edges). */
function screenHitsRect(x: number, y: number, r: DOMRect): boolean {
  return x >= r.left && x <= r.right && y >= r.top && y <= r.bottom
}

/**
 * I-bar creates behind overlap-hidden (and any other) frames at the caret — not on top.
 * Uses painted bounds + computed z-index (includes `.tt-front-clip` raise); when inline
 * z-index ties, later nodes in the array paint above, so we insert before the top cover.
 */
export function planIbarSpawnUnderCover(
  nds: Node[],
  flowX: number,
  flowY: number,
  toScreen: (p: { x: number; y: number }) => { x: number; y: number }
): IbarSpawnStackPlan {
  if (typeof document === 'undefined') {
    return { insertIndex: nds.length, zIndex: 0 }
  }

  const screen = toScreen({ x: flowX, y: flowY })
  let coverId: string | null = null
  let coverComputedZ = -Infinity
  let coverArrayIdx = -1

  document
    .querySelectorAll<HTMLElement>('.react-flow__node-chatPanel, .react-flow__node-blockGroup')
    .forEach((el) => {
      const id = el.getAttribute('data-id')
      if (!id) return
      const r = el.getBoundingClientRect()
      if (!screenHitsRect(screen.x, screen.y, r)) return
      const parsed = parseInt(window.getComputedStyle(el).zIndex, 10)
      const z = Number.isFinite(parsed) ? parsed : 0
      const idx = nds.findIndex((n) => n.id === id)
      const idxForTie = idx >= 0 ? idx : -1
      const wins =
        z > coverComputedZ ||
        (z === coverComputedZ && idxForTie > coverArrayIdx)
      if (!wins) return
      coverComputedZ = z
      coverId = id
      coverArrayIdx = idxForTie
    })

  if (!coverId || coverArrayIdx < 0) {
    return { insertIndex: nds.length, zIndex: 0 }
  }

  const cover = nds[coverArrayIdx]
  const inlineZ = typeof cover.zIndex === 'number' ? cover.zIndex : 0
  return {
    insertIndex: coverArrayIdx,
    zIndex: inlineZ > 0 ? inlineZ - 1 : 0,
  }
}

/** Insert a panel before its cover — message rebuild must not append it last. */
export function insertIbarSpawnInStack(
  nodes: Node[],
  newNode: Node,
  beforeNodeId?: string | null
): Node[] {
  const meta = (newNode.data as { promptMessage?: { metadata?: Record<string, unknown> } } | undefined)
    ?.promptMessage?.metadata
  const before =
    beforeNodeId ||
    (typeof meta?.[IBAR_STACK_BEFORE_NODE_ID] === 'string'
      ? (meta[IBAR_STACK_BEFORE_NODE_ID] as string)
      : undefined)
  if (!before) return [...nodes, newNode]
  const idx = nodes.findIndex((n) => n.id === before)
  if (idx < 0) return [...nodes, newNode]
  return [...nodes.slice(0, idx), newNode, ...nodes.slice(idx)]
}
