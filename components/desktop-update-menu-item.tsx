'use client'

import { useEffect, useState } from 'react'
import { ArrowDownToLine, Check, Loader2, RefreshCw } from 'lucide-react'
import { DropdownMenuItem } from '@/components/ui/dropdown-menu'
import type { NodNotesUpdateStatus } from '@/types/nodnotes-desktop'

type DesktopUpdateMenuItemProps = {
  filterQuery: string // More-menu search string
}

function matchesQuery(label: string, q: string): boolean {
  if (!q) return true
  return label.toLowerCase().includes(q)
}

/**
 * More-menu row for the Electron shell: check / download / restart into a new build.
 * Hidden in the browser (no window.nodnotesDesktop).
 */
export function DesktopUpdateMenuItem({ filterQuery }: DesktopUpdateMenuItemProps) {
  const [isDesktop, setIsDesktop] = useState(false)
  const [version, setVersion] = useState<string | null>(null)
  const [status, setStatus] = useState<NodNotesUpdateStatus>({ status: 'idle' })

  useEffect(() => {
    const desktop = window.nodnotesDesktop
    if (!desktop?.isDesktop) return // Browser session — no update row
    setIsDesktop(true)
    void desktop.getVersion().then(setVersion)
    void desktop.getUpdateStatus().then(setStatus)
    return desktop.onUpdateStatus(setStatus) // Live progress from main
  }, [])

  if (!isDesktop) return null
  if (
    !matchesQuery('check for updates', filterQuery) &&
    !matchesQuery('update', filterQuery) &&
    !matchesQuery('restart', filterQuery)
  ) {
    return null
  }

  const busy = status.status === 'checking' || status.status === 'downloading'
  const ready = status.status === 'ready'
  const label = (() => {
    if (status.status === 'checking') return 'Checking for updates…'
    if (status.status === 'downloading') {
      return `Downloading update${status.percent != null ? ` (${status.percent}%)` : '…'}`
    }
    if (status.status === 'available') {
      return status.version ? `Update ${status.version} available…` : 'Update available…'
    }
    if (ready) {
      return status.version ? `Restart to install ${status.version}` : 'Restart to install update'
    }
    if (status.status === 'current') {
      return version ? `Up to date (v${version})` : 'Up to date'
    }
    if (status.status === 'dev') return 'Updates require the installed app'
    if (status.status === 'error') return 'Couldn’t check for updates'
    return version ? `Check for updates (v${version})` : 'Check for updates'
  })()

  const Icon = busy ? Loader2 : ready ? ArrowDownToLine : status.status === 'current' ? Check : RefreshCw

  return (
    <DropdownMenuItem
      disabled={busy}
      onClick={() => {
        const desktop = window.nodnotesDesktop
        if (!desktop) return
        if (ready) {
          void desktop.quitAndInstall() // Relaunch into downloaded build
          return
        }
        void desktop.checkForUpdates() // Kick electron-updater
      }}
    >
      <Icon className={`h-4 w-4 mr-2 ${busy ? 'animate-spin' : ''}`} />
      {label}
    </DropdownMenuItem>
  )
}
