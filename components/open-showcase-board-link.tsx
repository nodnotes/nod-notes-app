'use client'

// Homepage "Open board" — guests stay on ephemeral /view; signed-in users claim a private copy.
import { useState, type MouseEvent, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import { useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { cn } from '@/lib/utils'

type OpenShowcaseBoardLinkProps = {
  masterBoardId: string // Env showcase master id
  className?: string
  children: ReactNode
}

export function OpenShowcaseBoardLink({
  masterBoardId,
  className,
  children,
}: OpenShowcaseBoardLinkProps) {
  const router = useRouter()
  const queryClient = useQueryClient()
  const [busy, setBusy] = useState(false) // Prevent double-claim on rapid clicks

  const onClick = async (event: MouseEvent<HTMLAnchorElement>) => {
    event.preventDefault() // Always handle — guest → /view, signed-in → claim
    if (busy) return
    setBusy(true)
    try {
      const supabase = createClient()
      const {
        data: { session },
      } = await supabase.auth.getSession()
      if (!session) {
        window.location.assign(`/view/${masterBoardId}`) // Ephemeral playground; no boards list row
        return
      }

      const res = await fetch('/api/showcase-board/claim', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ masterBoardId }),
      })
      const payload = (await res.json().catch(() => null)) as {
        boardId?: string
        error?: string
      } | null
      if (!res.ok || !payload?.boardId) {
        console.error('Failed to open showcase board:', payload?.error || res.status)
        window.location.assign(`/view/${masterBoardId}`) // Fall back to playground
        return
      }

      await queryClient.invalidateQueries({ queryKey: ['conversations'] }) // Show the new board in nav
      router.push(`/board/${payload.boardId}`) // Owned editable copy
    } catch (err) {
      console.error('Open showcase board failed:', err)
      window.location.assign(`/view/${masterBoardId}`)
    } finally {
      setBusy(false)
    }
  }

  return (
    <a
      href={`/view/${masterBoardId}`}
      onClick={onClick}
      className={cn(className, busy && 'pointer-events-none opacity-60')}
      aria-busy={busy || undefined}
    >
      {children}
    </a>
  )
}
