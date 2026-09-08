'use client'

// Notion connect host + More-menu Connections row (OAuth / import / disconnect / top-bar pin)

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { useQueryClient } from '@tanstack/react-query'
import { LayoutGrid, Sparkles } from 'lucide-react' // Connections + import
import {
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
} from './ui/dropdown-menu'
import { NotionImportModal } from './notion-import-modal'
import { NotionMarkIcon } from './notion-mark-icon' // Monochrome — matches other top-bar icons
import { SyncIcon } from './sync-icon' // Unsynced connection updates (left of Connections)
import { cn } from '@/lib/utils'
import { useConnectionSyncPending } from '@/lib/notion/use-connection-sync-pending'

/** localStorage — whether the connected Notion mark stays left of Share. */
const TOPBAR_PIN_KEY = 'nodnotes-notion-topbar-pinned'
/** localStorage — last-selected Notion workspace in the connection panel. */
const ACTIVE_WORKSPACE_KEY = 'nodnotes-notion-active-workspace-id'

export type NotionWorkspaceSummary = {
  workspaceId: string
  workspaceName: string | null
  workspaceIcon: string | null
  updatedAt: string | null
}

type NotionStatus = {
  configured: boolean
  connected: boolean
  workspaces?: NotionWorkspaceSummary[]
  workspaceId?: string | null
  workspaceName?: string | null
  workspaceIcon?: string | null
}

type NotionConnectApi = {
  status: NotionStatus | null
  loading: boolean
  topBarPinned: boolean
  authHref: string
  workspaces: NotionWorkspaceSummary[]
  activeWorkspaceId: string | null
  setActiveWorkspaceId: (workspaceId: string) => void
  startConnect: () => void
  disconnect: (workspaceId?: string) => Promise<void>
  openPicker: () => void
  setTopBarPinned: (pinned: boolean) => void
}

const NotionConnectContext = createContext<NotionConnectApi | null>(null) // Shared by host + menu rows

/** Read Notion connect API from the nearest provider (top-bar pin, More menu). */
export function useNotionConnect(): NotionConnectApi | null {
  return useContext(NotionConnectContext)
}

/** Read pin preference; default true so a fresh connect appears left of Share. */
export function readNotionTopBarPinned(): boolean {
  if (typeof window === 'undefined') return true
  try {
    const raw = window.localStorage.getItem(TOPBAR_PIN_KEY)
    if (raw === null) return true // First connect → pin
    return raw !== '0' && raw !== 'false'
  } catch {
    return true
  }
}

/** Read active workspace id from localStorage. */
function readActiveWorkspaceId(): string | null {
  if (typeof window === 'undefined') return null
  try {
    return window.localStorage.getItem(ACTIVE_WORKSPACE_KEY)
  } catch {
    return null
  }
}

/** Persist the workspace selected in the connection panel. */
function writeActiveWorkspaceId(workspaceId: string) {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(ACTIVE_WORKSPACE_KEY, workspaceId)
  } catch {
    /* ignore */
  }
}

/** Build the OAuth start URL for the current board path. */
function buildAuthHref(pathname: string | null): string {
  const returnTo = pathname && pathname.startsWith('/') ? pathname : '/board'
  return `/api/notion/auth?returnTo=${encodeURIComponent(returnTo)}`
}

/**
 * More → Connections — open the Notion connection panel when connected.
 */
function NotionConnectedActions() {
  const api = useNotionConnect()
  if (!api?.status?.connected) return null
  const { status, openPicker } = api

  return (
    <>
      <DropdownMenuItem disabled className="text-xs text-gray-500">
        Connected{status.workspaceName ? ` · ${status.workspaceName}` : ''}
      </DropdownMenuItem>
      <DropdownMenuItem
        onSelect={(e) => {
          e.preventDefault()
          window.setTimeout(() => openPicker(), 0)
        }}
      >
        <Sparkles className="h-4 w-4 mr-2 shrink-0" />
        Manage connection
      </DropdownMenuItem>
    </>
  )
}

/** Fetch status, own the import modal, and listen for AI-composer connect events. */
export function NotionConnectProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() // Current board path for returnTo
  const router = useRouter() // Navigate after import
  const queryClient = useQueryClient() // Refresh note panels after import
  const [status, setStatus] = useState<NotionStatus | null>(null) // Connection state from API
  const [loading, setLoading] = useState(true) // Initial fetch in flight
  const [pickerOpen, setPickerOpen] = useState(false)
  const [topBarPinned, setTopBarPinnedState] = useState(true)
  const [workspaces, setWorkspaces] = useState<NotionWorkspaceSummary[]>([])
  const [activeWorkspaceId, setActiveWorkspaceIdState] = useState<string | null>(null)

  const authHref = useMemo(() => buildAuthHref(pathname), [pathname])

  useEffect(() => {
    setTopBarPinnedState(readNotionTopBarPinned()) // Client-only preference
  }, [])

  useEffect(() => {
    let cancelled = false // Avoid setState after unmount
    const load = async () => {
      try {
        const res = await fetch('/api/notion/status') // Server-safe status (no token)
        if (!res.ok) {
          if (!cancelled) setStatus({ configured: true, connected: false }) // Treat 401 as disconnected
          return
        }
        const data = (await res.json()) as NotionStatus
        if (!cancelled) {
          setStatus(data)
          const list = data.workspaces ?? []
          setWorkspaces(list)
          const saved = readActiveWorkspaceId()
          const nextActive =
            list.find((w) => w.workspaceId === saved)?.workspaceId ??
            list.find((w) => w.workspaceId === data.workspaceId)?.workspaceId ??
            list[0]?.workspaceId ??
            null
          setActiveWorkspaceIdState(nextActive)
          if (nextActive) writeActiveWorkspaceId(nextActive)
        }
        if (!cancelled) window.dispatchEvent(new CustomEvent('nodnotes-notion-status')) // Top bar re-measures connection chrome
      } catch {
        if (!cancelled) setStatus({ configured: false, connected: false }) // Offline / misconfig
      } finally {
        if (!cancelled) setLoading(false) // Stop spinner state
      }
    }
    load() // Fetch on mount
    return () => {
      cancelled = true // Cleanup
    }
  }, [])

  // After OAuth connect / Edit permissions, open the page picker (do not override Unpin)
  useEffect(() => {
    if (typeof window === 'undefined') return
    const params = new URLSearchParams(window.location.search)
    const shouldOpen = params.get('notion') === 'connected' || params.get('picker') === '1'
    if (!shouldOpen || !status?.connected) return
    setPickerOpen(true)
    // Default pin is already true when no preference exists; never force-pin here —
    // Edit permissions / import used to rewrite localStorage and undo Unpin.
    params.delete('notion')
    params.delete('picker')
    params.delete('imported')
    const next = params.toString()
    window.history.replaceState({}, '', window.location.pathname + (next ? `?${next}` : ''))
  }, [status?.connected])

  const startConnect = useCallback(() => {
    if (status?.configured === false) {
      window.alert(
        'Add NOTION_CLIENT_ID and NOTION_CLIENT_SECRET to .env.local from a Notion public connection (redirect URI: http://localhost:3031/api/notion/callback), then restart the dev server.'
      ) // Guide local setup when secrets are missing
      return
    }
    // Hard navigation — first-time connect / same path as Edit permissions <a>
    window.location.assign(buildAuthHref(pathname))
  }, [status?.configured, pathname])

  const handleImport = async (opts: { pageIds: string[]; mode: 'card' | 'mindmap'; signal?: AbortSignal }) => {
    const res = await fetch('/api/notion/import', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        returnTo: pathname || '/board',
        pageIds: opts.pageIds,
        mode: opts.mode,
        workspaceId: activeWorkspaceId,
      }),
      signal: opts.signal, // Cancel from the picker aborts this request
    })
    if (opts.signal?.aborted) return // Ignore a response that raced cancel
    const data = await res.json()
    if (data?.cancelled) return // Server stopped after AbortSignal
    if (!res.ok) {
      throw new Error(data.error || 'Failed to import Notion pages')
    }
    if (data.conversationId) {
      await queryClient.invalidateQueries({ queryKey: ['messages-for-panels', data.conversationId] })
      await queryClient.invalidateQueries({ queryKey: ['panel-edges', data.conversationId] }) // Mindmap threads
      await queryClient.invalidateQueries({ queryKey: ['conversations'] }) // Refresh Pages menu nesting
      await queryClient.invalidateQueries({ queryKey: ['path-board-menu'] })
      await queryClient.invalidateQueries({ queryKey: ['edit-panel-title'] })
      if (!pathname?.includes(data.conversationId)) {
        router.push(`/board/${data.conversationId}?notion=connected&imported=${data.importedCount || 0}`)
      } else {
        await queryClient.refetchQueries({ queryKey: ['messages-for-panels', data.conversationId] })
        await queryClient.refetchQueries({ queryKey: ['panel-edges', data.conversationId] }) // Load new threads
        await queryClient.refetchQueries({ queryKey: ['conversations'] })
        window.setTimeout(() => {
          window.dispatchEvent(new CustomEvent('fit-view-start'))
        }, 300)
      }
    }
  }

  const disconnect = useCallback(async (workspaceId?: string) => {
    const targetId = workspaceId ?? activeWorkspaceId
    setLoading(true)
    try {
      await fetch('/api/notion/disconnect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workspaceId: targetId }),
      })
      const res = await fetch('/api/notion/status')
      const data = (res.ok ? await res.json() : null) as NotionStatus | null
      const list = data?.workspaces ?? []
      setWorkspaces(list)
      setStatus(
        data ?? { configured: true, connected: false, workspaces: [], workspaceName: null, workspaceId: null }
      )
      const nextActive = list[0]?.workspaceId ?? null
      setActiveWorkspaceIdState(nextActive)
      if (nextActive) writeActiveWorkspaceId(nextActive)
      else {
        try {
          window.localStorage.removeItem(ACTIVE_WORKSPACE_KEY)
        } catch {
          /* ignore */
        }
      }
      window.dispatchEvent(new CustomEvent('nodnotes-notion-status'))
      if (!list.length) {
        setPickerOpen(false)
        setTopBarPinnedState(true)
        try {
          window.localStorage.removeItem(TOPBAR_PIN_KEY)
        } catch {
          /* ignore */
        }
      }
    } finally {
      setLoading(false)
    }
  }, [activeWorkspaceId])

  const openPicker = useCallback(() => {
    setPickerOpen(true) // Import pages from More / top-bar connection popup
  }, [])

  const setTopBarPinned = useCallback((pinned: boolean) => {
    setTopBarPinnedState(pinned)
    try {
      window.localStorage.setItem(TOPBAR_PIN_KEY, pinned ? '1' : '0')
    } catch {
      /* ignore quota */
    }
  }, [])

  // AI composer Connection menu → open Notion connect / import
  useEffect(() => {
    const onOpen = () => {
      if (status?.connected) setPickerOpen(true)
      else startConnect()
    }
    window.addEventListener('nodnotes-open-notion-connect', onOpen)
    return () => window.removeEventListener('nodnotes-open-notion-connect', onOpen)
  }, [status?.connected, startConnect])

  const setActiveWorkspaceId = useCallback((workspaceId: string) => {
    setActiveWorkspaceIdState(workspaceId)
    writeActiveWorkspaceId(workspaceId)
    const hit = workspaces.find((w) => w.workspaceId === workspaceId)
    setStatus((prev) =>
      prev
        ? {
            ...prev,
            workspaceId,
            workspaceName: hit?.workspaceName ?? prev.workspaceName,
            workspaceIcon: hit?.workspaceIcon ?? prev.workspaceIcon,
          }
        : prev
    )
  }, [workspaces])

  const api = useMemo<NotionConnectApi>(
    () => ({
      status,
      loading,
      topBarPinned,
      authHref,
      workspaces,
      activeWorkspaceId,
      setActiveWorkspaceId,
      startConnect,
      disconnect,
      openPicker,
      setTopBarPinned,
    }),
    [
      status,
      loading,
      topBarPinned,
      authHref,
      workspaces,
      activeWorkspaceId,
      setActiveWorkspaceId,
      startConnect,
      disconnect,
      openPicker,
      setTopBarPinned,
    ]
  )

  return (
    <NotionConnectContext.Provider value={api}>
      {/* Hidden hit target so AI composer can still click [data-notion-connect] */}
      <button
        type="button"
        data-notion-connect
        className="sr-only"
        tabIndex={-1}
        aria-hidden
        onClick={() => {
          if (status?.connected) setPickerOpen(true)
          else startConnect()
        }}
      />
      {children}
      <NotionImportModal
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        onImport={handleImport}
        authHref={authHref}
        workspaces={workspaces}
        activeWorkspaceId={activeWorkspaceId}
        onWorkspaceChange={setActiveWorkspaceId}
        topBarPinned={topBarPinned}
        onSetTopBarPinned={setTopBarPinned}
        onDisconnect={() => disconnect(activeWorkspaceId ?? undefined)}
        disconnecting={loading}
      />
    </NotionConnectContext.Provider>
  )
}

/** More → Connections — flat actions when connected (no 3rd nested submenu that ate OAuth clicks). */
export function NotionConnectMenuItems({ filterQuery = '' }: { filterQuery?: string }) {
  const api = useContext(NotionConnectContext) // Provider owns status / OAuth
  if (!api) return null
  const { status, loading, authHref } = api
  const q = filterQuery.trim().toLowerCase() // Search actions… filter
  const hay = `connections notion unpin pin permissions manage ${status?.workspaceName || ''}` // Match row or actions
  if (q && !hay.toLowerCase().includes(q)) return null // Hide when search misses
  const rightLabel = status?.connected ? status.workspaceName || 'Notion' : 'None' // Screenshot-style status

  return (
    <DropdownMenuSub>
      <DropdownMenuSubTrigger
        disabled={loading}
        className={cn('text-sm', loading && 'opacity-50')}
        title={status?.connected ? `Connections · ${rightLabel}` : 'Connections'}
      >
        <LayoutGrid className="h-4 w-4 mr-2" />
        Connections
        <span className="ml-auto mr-1 text-xs text-gray-400">{rightLabel}</span>
      </DropdownMenuSubTrigger>
      <DropdownMenuSubContent className="w-56">
        {status?.connected ? (
          <>
            <div className="px-2 py-1.5 flex items-center gap-2 text-sm text-gray-700">
              <NotionMarkIcon className="h-4 w-4" />
              <span className="truncate">Notion</span>
            </div>
            <DropdownMenuSeparator />
            <NotionConnectedActions />
          </>
        ) : (
          <DropdownMenuItem asChild disabled={loading}>
            <a
              href={status?.configured === false ? undefined : authHref}
              title={
                status?.configured === false
                  ? 'Notion OAuth credentials missing — click for setup steps'
                  : 'Connect Notion'
              }
              onClick={(e) => {
                if (status?.configured === false) {
                  e.preventDefault()
                  api.startConnect() // Shows the env setup alert
                }
              }}
              className="cursor-pointer"
            >
              <NotionMarkIcon className="h-4 w-4 mr-2" />
              Notion
            </a>
          </DropdownMenuItem>
        )}
      </DropdownMenuSubContent>
    </DropdownMenuSub>
  )
}

/**
 * Top-bar sync glyph — left of the Notion (Connections) pin; blue when updates are pending.
 */
export function ConnectionSyncTopBarIndicator({ conversationId }: { conversationId?: string }) {
  const api = useNotionConnect()
  const pending = useConnectionSyncPending(conversationId)
  if (!api?.status?.connected) return null

  return (
    <span
      data-top-bar-connection-sync
      className="h-7 w-7 inline-flex items-center justify-center flex-shrink-0"
      title={pending ? 'Connection updates available' : 'Connections in sync'}
      aria-label={pending ? 'Connection updates available' : 'Connections in sync'}
    >
      <SyncIcon
        className={cn(
          'h-4 w-4',
          pending ? 'text-[#2383e2]' : 'text-gray-300 dark:text-gray-600'
        )}
      />
    </span>
  )
}

/**
 * Top-bar pin left of Share — opens the Notion connection panel.
 */
export function NotionTopBarPin({ className }: { className?: string }) {
  const api = useNotionConnect()
  if (!api?.status?.connected || !api.topBarPinned) return null
  const label = api.status.workspaceName
    ? `Notion · ${api.status.workspaceName}`
    : 'Notion connection'

  return (
    <button
      type="button"
      data-notion-topbar-pin
      title={label}
      aria-label={label}
      disabled={api.loading}
      onClick={() => api.openPicker()}
      className={cn(
        'h-7 w-7 p-0 inline-flex items-center justify-center rounded-md text-gray-700 hover:text-gray-900 hover:bg-gray-100 flex-shrink-0 disabled:opacity-50',
        className
      )}
    >
      <NotionMarkIcon className="h-4 w-4" />
    </button>
  )
}
