import type { DrawTool } from '@/components/react-flow-context'

export const PREVIEW_HOST_TOOLS_MESSAGE = 'thinktable-preview-host-tools'

export type PreviewHostTools = {
  isScrollMode: boolean
  isDrawing: boolean
  drawTool: DrawTool | null
  drawShape: string
  mapPointerTool: 'select' | 'pan'
  fillColor: string
  borderColor: string
  borderWeight: number
  borderStyle: string
  snapEnabled: boolean
}

export function postPreviewHostTools(
  target: Window,
  pageId: string,
  tools: PreviewHostTools
) {
  target.postMessage(
    { type: PREVIEW_HOST_TOOLS_MESSAGE, pageId, tools },
    window.location.origin
  )
}
