'use client'

import { BoardFlow } from '@/components/board-flow'
import { EditorProvider } from '@/components/editor-context'
import { ReactFlowContextProvider } from '@/components/react-flow-context'
import { cn } from '@/lib/utils'

type HomeBoardPreviewProps = {
  boardId: string
  title: string
  /** Marks this preview for decorative thread anchors (`1` | `2` | `3`). */
  previewSlot?: 1 | 2 | 3
  /** Taller single-column showcase. */
  fullWidth?: boolean
}

export function HomeBoardPreview({
  boardId,
  title,
  previewSlot,
  fullWidth = false,
}: HomeBoardPreviewProps) {
  return (
    <div
      {...(previewSlot != null ? { 'data-home-preview': String(previewSlot) } : {})}
      className={cn(
        'relative w-full overflow-hidden border-2 border-gray-700 bg-muted/30 shadow-sm',
        fullWidth
          ? 'h-[min(560px,70vh)] rounded-xl'
          : 'h-[min(420px,55vh)] rounded-xl'
      )}
      aria-label={`${title} board preview`}
    >
      <EditorProvider>
        <ReactFlowContextProvider conversationId={boardId}>
          <BoardFlow conversationId={boardId} hideMapChrome />
        </ReactFlowContextProvider>
      </EditorProvider>
    </div>
  )
}
