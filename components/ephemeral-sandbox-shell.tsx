'use client'

// Loads a public master board, mints an in-memory clone, and renders children with that id.
// Unmount / reload drops the clone so the next visit starts from the master again.

import { useEffect, useState, type ReactNode } from 'react'
import type { PublicBoardPayload } from '@/lib/public-board-fetch'
import {
  mintEphemeralSandbox,
  unregisterEphemeralSandbox,
} from '@/lib/ephemeral-sandbox'

type EphemeralSandboxShellProps = {
  masterBoardId: string // Showcase master conversation id (env)
  children: (sandboxId: string) => ReactNode // Render board with the clone id
  fallback?: ReactNode // Shown while the master is fetched / cloned
}

export function EphemeralSandboxShell({
  masterBoardId,
  children,
  fallback = null,
}: EphemeralSandboxShellProps) {
  const [sandboxId, setSandboxId] = useState<string | null>(null) // Active clone id

  useEffect(() => {
    let cancelled = false // Ignore late resolves after unmount / master change
    let registeredId: string | null = null // So cleanup can unregister
    setSandboxId(null) // Clear while reminting for a new master

    ;(async () => {
      try {
        const res = await fetch(`/api/public-board/${masterBoardId}`) // Master snapshot
        if (!res.ok) return // Leave fallback up on failure
        const master = (await res.json()) as PublicBoardPayload
        const id = mintEphemeralSandbox(master) // Fresh ids, registered in memory
        registeredId = id
        if (!cancelled) setSandboxId(id) // Mount the playground
      } catch {
        // Network / parse failure — keep fallback
      }
    })()

    return () => {
      cancelled = true
      if (registeredId) unregisterEphemeralSandbox(registeredId) // Drop clone
    }
  }, [masterBoardId])

  if (!sandboxId) return <>{fallback}</>
  return <>{children(sandboxId)}</>
}
