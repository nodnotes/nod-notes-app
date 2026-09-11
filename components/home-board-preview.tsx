'use client'

import { BoardFlow } from '@/components/board-flow'
import { ChatSidebar } from '@/components/chat-sidebar'
import { EditorProvider } from '@/components/editor-context'
import { EphemeralSandboxShell } from '@/components/ephemeral-sandbox-shell'
import { ReactFlowContextProvider } from '@/components/react-flow-context'
import { SidebarContextProvider } from '@/components/sidebar-context'
import { cn } from '@/lib/utils'

type HomeBoardPreviewProps = {
  boardId: string // Master showcase board id (env)
  title: string
  /** Marks this preview for decorative thread anchors (`1` | `2` | `3`). */
  previewSlot?: 1 | 2 | 3
  /** Taller single-column showcase. */
  fullWidth?: boolean
  /** Show the AI chat column (marketing preview; board wheel-locked, chat still scrolls). */
  showAiSidebar?: boolean
}

export function HomeBoardPreview({
  boardId,
  title,
  previewSlot,
  fullWidth = false,
  showAiSidebar = false,
}: HomeBoardPreviewProps) {
  // Each visit gets a remapped in-memory clone of the master — reload resets it
  const board = (sandboxId: string) => (
    <EditorProvider>
      <ReactFlowContextProvider conversationId={sandboxId}>
        {showAiSidebar ? (
          <div className="flex h-full min-h-0">
            <div className="relative min-w-0 flex-1 h-full">
              <BoardFlow conversationId={sandboxId} hideMapChrome />
            </div>
            <ChatSidebar conversationId={sandboxId} />
          </div>
        ) : (
          <BoardFlow conversationId={sandboxId} hideMapChrome />
        )}
      </ReactFlowContextProvider>
    </EditorProvider>
  )

  return (
    <div
      {...(previewSlot != null ? { 'data-home-preview': String(previewSlot) } : {})}
      className={cn(
        'relative w-full overflow-hidden border-2 border-gray-700 bg-muted/30 shadow-lg',
        fullWidth
          ? 'h-[min(560px,70vh)] rounded-xl'
          : 'h-[min(420px,55vh)] rounded-xl'
      )}
      aria-label={`${title} board preview`}
    >
      <EphemeralSandboxShell
        masterBoardId={boardId}
        fallback={<div className="h-full w-full bg-muted/20" aria-hidden />}
      >
        {(sandboxId) =>
          showAiSidebar ? (
            <SidebarContextProvider initialChatOpen previewMode>
              {board(sandboxId)}
            </SidebarContextProvider>
          ) : (
            board(sandboxId)
          )
        }
      </EphemeralSandboxShell>
    </div>
  )
}
