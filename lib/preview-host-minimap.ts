import {
  computeMinimapGeometry,
  minimapNodesInViewBounds,
  stickMinimapFrame,
  type MinimapFlowRect,
} from '@/lib/minimap-geometry'

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

/** Same viewBox math as BoardMiniMap — host renders preview snapshot in the chrome slot. */
export function computePreviewMinimapGeometry(
  state: PreviewMinimapState,
  elementWidth: number,
  elementHeight: number,
  offsetScale = 5,
  scopeZoom = 1, // Independent of host + nested cameras — 1 fits the board view
  held?: { zoom: number; frame: MinimapFlowRect | null } // Same pan-stick as the host minimap
) {
  const zoom = state.transform[2]
  const viewBB = {
    x: -state.transform[0] / zoom,
    y: -state.transform[1] / zoom,
    width: state.width / zoom,
    height: state.height / zoom,
  }
  const visible =
    state.nodes.length > 0
      ? minimapNodesInViewBounds(state.nodes, viewBB) // Same in-view slice as the board minimap
      : null
  const stuck = stickMinimapFrame(visible, zoom, held ?? { zoom: Number.NaN, frame: null })
  return {
    ...computeMinimapGeometry(
      viewBB,
      stuck.frame,
      elementWidth,
      elementHeight,
      offsetScale,
      scopeZoom
    ),
    stick: stuck,
  }
}

