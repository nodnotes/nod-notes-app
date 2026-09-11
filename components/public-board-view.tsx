'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useQueryClient } from '@tanstack/react-query'
import { BoardFlow } from '@/components/board-flow'
import { EditorProvider } from '@/components/editor-context'
import { EphemeralSandboxShell } from '@/components/ephemeral-sandbox-shell'
import { ReactFlowContextProvider } from '@/components/react-flow-context'
import { createClient } from '@/lib/supabase/client'

/** Full-screen public view — guests get an ephemeral clone; signed-in users claim then go to /board. */
export function PublicBoardView({ masterBoardId }: { masterBoardId: string }) {
  const router = useRouter()
  const queryClient = useQueryClient()
  const [mode, setMode] = useState<'loading' | 'guest' | 'redirecting'>('loading')

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const supabase = createClient()
      const {
        data: { session },
      } = await supabase.auth.getSession()
      if (cancelled) return
      if (!session) {
        setMode('guest') // Ephemeral sandbox — nothing written to their boards list
        return
      }

      setMode('redirecting')
      try {
        const res = await fetch('/api/showcase-board/claim', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ masterBoardId }),
        })
        const payload = (await res.json().catch(() => null)) as {
          boardId?: string
        } | null
        if (cancelled) return
        if (res.ok && payload?.boardId) {
          await queryClient.invalidateQueries({ queryKey: ['conversations'] })
          router.replace(`/board/${payload.boardId}`)
          return
        }
      } catch {
        // Fall through to guest playground
      }
      if (!cancelled) setMode('guest')
    })()
    return () => {
      cancelled = true
    }
  }, [masterBoardId, queryClient, router])

  if (mode === 'loading' || mode === 'redirecting') {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-background text-muted-foreground">
        {mode === 'redirecting' ? 'Opening your board…' : 'Loading board…'}
      </div>
    )
  }

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
