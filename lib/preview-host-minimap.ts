import { computeMinimapGeometry } from '@/lib/minimap-geometry'

export const PREVIEW_MINIMAP_STATE_MESSAGE = 'nodnotes-preview-minimap-state'
export const PREVIEW_MINIMAP_COMMAND_MESSAGE = 'nodnotes-preview-minimap-command'

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

/** Same viewBox math as BoardMiniMap — host renders preview snapshot in the chrome slot. */
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
  const content = state.nodes.length > 0 ? previewNodesBounds(state.nodes) : null
  return computeMinimapGeometry(viewBB, content, elementWidth, elementHeight, offsetScale)
}

export function computePreviewMinimapViewScale(
  state: PreviewMinimapState,
  elementWidth: number,
  elementHeight: number
): number {
  return computePreviewMinimapGeometry(state, elementWidth, elementHeight).viewScale
}
