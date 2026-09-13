'use client'

// Page-level collab shell so top bar presence + board TipTap share one Y.Doc session

import type { ReactNode } from 'react'
import { BoardCollabProvider } from '@/lib/collab/board-collab-context'
import { isEphemeralSandboxId } from '@/lib/ephemeral-sandbox'

export function BoardCollabShell({
  boardId,
  children,
}: {
  boardId: string
  children: ReactNode
}) {
  const enabled = !!boardId && !isEphemeralSandboxId(boardId)
  return (
    <BoardCollabProvider boardId={boardId} enabled={enabled}>
      {children}
    </BoardCollabProvider>
  )
}
