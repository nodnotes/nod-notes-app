import type { DrawTool } from '@/components/react-flow-context'

export const PREVIEW_HOST_TOOLS_MESSAGE = 'nodnotes-preview-host-tools'

export type PreviewHostTools = {
  interactive: boolean // false = view-only thumbnail inside the preview shell
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

/** Deselected preview: static embed — no pan/zoom/draw until the user selects it. */
export const PREVIEW_IDLE_HOST_TOOLS: PreviewHostTools = {
  interactive: false,
  isScrollMode: true,
  isDrawing: false,
  drawTool: null,
  drawShape: 'rectangle',
  mapPointerTool: 'pan',
  fillColor: '',
  borderColor: '',
  borderWeight: 1,
  borderStyle: 'solid',
  snapEnabled: false,
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
