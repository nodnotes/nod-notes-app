'use client'

import { BoardFlow } from '@/components/board-flow'
import { EditorProvider } from '@/components/editor-context'
import { ReactFlowContextProvider } from '@/components/react-flow-context'

type HomeBoardPreviewProps = {
  boardId: string
  title: string
}

export function HomeBoardPreview({ boardId, title }: HomeBoardPreviewProps) {
  return (
    <div
      className="relative h-[min(420px,55vh)] w-full overflow-hidden rounded-xl border border-border bg-muted/30 shadow-sm"
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
