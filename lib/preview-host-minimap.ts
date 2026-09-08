import { getBoundsOfRects } from '@reactflow/core'

export const PREVIEW_MINIMAP_STATE_MESSAGE = 'thinktable-preview-minimap-state'
export const PREVIEW_MINIMAP_COMMAND_MESSAGE = 'thinktable-preview-minimap-command'

export type PreviewMinimapNode = {
  id: string
  x: number
  y: number
  width: number
  height: number
  selected?: boolean
}

export type PreviewMinimapState = {
  pageId: string
  nodes: PreviewMinimapNode[]
  transform: [number, number, number]
  width: number
  height: number
}

export type PreviewMinimapCommand =
  | { type: 'fitView'; padding?: number; duration?: number }
  | { type: 'pan'; movementX: number; movementY: number; viewScale: number }
  | {
      type: 'setViewport'
      x: number
      y: number
      zoom: number
      duration?: number
    }

export function postPreviewMinimapCommand(
  target: Window,
  pageId: string,
  command: PreviewMinimapCommand
) {
  target.postMessage(
    { type: PREVIEW_MINIMAP_COMMAND_MESSAGE, pageId, command },
    window.location.origin
  )
}

export function getFocusedPreviewIframe(pageId: string): HTMLIFrameElement | null {
  return document.querySelector<HTMLIFrameElement>(
    `[data-page-preview-frame="${pageId}"]`
  )
}

function previewNodesBounds(nodes: PreviewMinimapNode[]) {
  if (nodes.length === 0) {
    return { x: 0, y: 0, width: 0, height: 0 }
  }
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const node of nodes) {
    minX = Math.min(minX, node.x)
    minY = Math.min(minY, node.y)
    maxX = Math.max(maxX, node.x + node.width)
    maxY = Math.max(maxY, node.y + node.height)
  }
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY }
}

/** Same viewBox math as @reactflow/minimap — host renders preview snapshot in the chrome slot. */
export function computePreviewMinimapGeometry(
  state: PreviewMinimapState,
  elementWidth: number,
  elementHeight: number,
  offsetScale = 5
) {
  const zoom = state.transform[2]
  const viewBB = {
    x: -state.transform[0] / zoom,
    y: -state.transform[1] / zoom,
    width: state.width / zoom,
    height: state.height / zoom,
  }
  const nodeBB = previewNodesBounds(state.nodes)
  const boundingRect =
    state.nodes.length > 0 ? getBoundsOfRects(nodeBB, viewBB) : viewBB
  const scaledWidth = boundingRect.width / elementWidth
  const scaledHeight = boundingRect.height / elementHeight
  const viewScale = Math.max(scaledWidth, scaledHeight)
  const viewWidth = viewScale * elementWidth
  const viewHeight = viewScale * elementHeight
  const offset = offsetScale * viewScale
  const x = boundingRect.x - (viewWidth - boundingRect.width) / 2 - offset
  const y = boundingRect.y - (viewHeight - boundingRect.height) / 2 - offset
  const width = viewWidth + offset * 2
  const height = viewHeight + offset * 2
  return { viewBB, boundingRect, viewScale, viewBox: `${x} ${y} ${width} ${height}`, offset, x, y, width, height }
}

export function computePreviewMinimapViewScale(
  state: PreviewMinimapState,
  elementWidth: number,
  elementHeight: number
): number {
  return computePreviewMinimapGeometry(state, elementWidth, elementHeight).viewScale
}
