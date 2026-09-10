'use client'

import { BoardFlow } from '@/components/board-flow'
import { EditorProvider } from '@/components/editor-context'
import { EphemeralSandboxShell } from '@/components/ephemeral-sandbox-shell'
import { ReactFlowContextProvider } from '@/components/react-flow-context'

/** Full-screen public view — interactive clone of the master; reload resets. */
export function PublicBoardView({ masterBoardId }: { masterBoardId: string }) {
  return (
    <div className="h-screen w-screen overflow-hidden bg-background">
      <EphemeralSandboxShell
        masterBoardId={masterBoardId}
        fallback={
          <div className="flex h-full w-full items-center justify-center text-muted-foreground">
            Loading board…
          </div>
        }
      >
        {(sandboxId) => (
          <EditorProvider>
            <ReactFlowContextProvider conversationId={sandboxId}>
              <BoardFlow conversationId={sandboxId} hideMapChrome />
            </ReactFlowContextProvider>
          </EditorProvider>
        )}
      </EphemeralSandboxShell>
    </div>
  )
}
