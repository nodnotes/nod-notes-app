'use client'

// Account menu → Connections: Notion dates database, Apple Calendar, and Google Calendar.

import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { usePathname } from 'next/navigation'
import { CalendarDays, Loader2 } from 'lucide-react'
import { Button, buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { Input } from '@/components/ui/input'
import { NotionMarkIcon } from '@/components/notion-mark-icon'
import type { NotionCalendarDatabase } from '@/lib/calendar-connections'

const REOPEN_KEY = 'nodnotes-account-section' // Reopen Connections after Notion OAuth returns

export const ACCOUNT_MENU_REOPEN_KEY = REOPEN_KEY

type FeedStatus = { connected: boolean; url: string | null }

type ConnectionsStatus = {
  apple: FeedStatus
  google: FeedStatus
  notionDb: NotionCalendarDatabase | null
}

type PageNode = {
  id: string
  object: string
  title: string
  children?: PageNode[]
}

type Managing = 'notion' | 'apple' | 'google' | null

/** Flatten the Notion page tree so the user can pick a parent for the new database. */
function flattenPages(nodes: PageNode[] | undefined, out: { id: string; title: string }[] = []) {
  for (const node of nodes ?? []) {
    if (node.object === 'page') out.push({ id: node.id, title: node.title || 'Untitled' })
    if (node.children?.length) flattenPages(node.children, out)
  }
  return out
}

/** One destination row in the Connections list. */
function ConnectionRow({
  selected,
  icon,
  title,
  status,
  onSelect,
}: {
  selected: boolean
  icon: ReactNode
  title: string
  status: string
  onSelect: () => void
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`flex w-full items-center gap-3 rounded-lg border px-3 py-3 text-left transition-colors ${
        selected
          ? 'border-gray-300 bg-gray-50 dark:border-gray-600 dark:bg-gray-800'
          : 'border-gray-200 hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-800'
      }`}
    >
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-gray-200 bg-white dark:border-gray-600 dark:bg-gray-900">
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium text-gray-900 dark:text-gray-100">{title}</span>
        <span className="block truncate text-xs text-gray-500 dark:text-gray-400">{status}</span>
      </span>
    </button>
  )
}

/** Manage the three places NodNotes dates can show up. */
export function AccountConnections() {
  const pathname = usePathname()
  const [status, setStatus] = useState<ConnectionsStatus | null>(null)
  const [notionConnected, setNotionConnected] = useState(false)
  const [workspaceName, setWorkspaceName] = useState<string | null>(null)
  const [managing, setManaging] = useState<Managing>('notion')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [pages, setPages] = useState<{ id: string; title: string }[]>([])
  const [pageQuery, setPageQuery] = useState('')
  const [parentPageId, setParentPageId] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  const load = useCallback(async () => {
    const [connectionsRes, notionRes] = await Promise.all([
      fetch('/api/calendar/connections'),
      fetch('/api/notion/status'),
    ])
    if (connectionsRes.ok) setStatus((await connectionsRes.json()) as ConnectionsStatus)
    if (notionRes.ok) {
      const notion = (await notionRes.json()) as { connected?: boolean; workspaceName?: string | null }
      setNotionConnected(Boolean(notion.connected))
      setWorkspaceName(notion.workspaceName ?? null)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  // Parent pages are only needed while creating a database
  useEffect(() => {
    if (managing !== 'notion' || !notionConnected || status?.notionDb) return
    let cancelled = false
    void fetch('/api/notion/pages')
      .then(async (res) => {
        if (!res.ok || cancelled) return
        const body = (await res.json()) as { sections?: { nodes?: PageNode[] }[]; tree?: PageNode[] }
        const fromSections = (body.sections ?? []).flatMap((section) => flattenPages(section.nodes))
        const list = fromSections.length ? fromSections : flattenPages(body.tree)
        const seen = new Set<string>()
        const unique = list.filter((page) => (seen.has(page.id) ? false : (seen.add(page.id), true)))
        if (!cancelled) setPages(unique)
      })
      .catch(() => {
        if (!cancelled) setError('Could not load Notion pages')
      })
    return () => {
      cancelled = true
    }
  }, [managing, notionConnected, status?.notionDb])

  const visiblePages = useMemo(() => {
    const q = pageQuery.trim().toLowerCase()
    const list = q ? pages.filter((page) => page.title.toLowerCase().includes(q)) : pages
    return list.slice(0, 12)
  }, [pageQuery, pages])

  const connectNotion = () => {
    try {
      sessionStorage.setItem(REOPEN_KEY, 'connections') // Land back on this page after OAuth
    } catch {
      /* ignore */
    }
    const returnTo = pathname && pathname.startsWith('/') ? pathname : '/board'
    window.location.href = `/api/notion/auth?returnTo=${encodeURIComponent(returnTo)}`
  }

  const createDatabase = async () => {
    if (!parentPageId) return
    setBusy(true)
    setError(null)
    try {
      const res = await fetch('/api/notion/calendar-database', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ parentPageId }),
      })
      const body = (await res.json().catch(() => null)) as { error?: string; notionDb?: NotionCalendarDatabase } | null
      if (!res.ok || !body?.notionDb) {
        setError(body?.error || 'Could not create the database')
        return
      }
      setStatus((prev) => (prev ? { ...prev, notionDb: body.notionDb ?? null } : prev))
    } finally {
      setBusy(false)
    }
  }

  const forgetDatabase = async () => {
    setBusy(true)
    setError(null)
    try {
      const res = await fetch('/api/notion/calendar-database', { method: 'DELETE' })
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null
        setError(body?.error || 'Could not remove the database link')
        return
      }
      setStatus((prev) => (prev ? { ...prev, notionDb: null } : prev))
    } finally {
      setBusy(false)
    }
  }

  const connectFeed = async (provider: 'apple' | 'google') => {
    setBusy(true)
    setError(null)
    try {
      const res = await fetch('/api/calendar/connections', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider }),
      })
      const body = (await res.json().catch(() => null)) as { error?: string; url?: string } | null
      if (!res.ok || !body?.url) {
        setError(body?.error || 'Could not create the calendar link')
        return
      }
      setStatus((prev) =>
        prev ? { ...prev, [provider]: { connected: true, url: body.url ?? null } } : prev
      )
    } finally {
      setBusy(false)
    }
  }

  const disconnectFeed = async (provider: 'apple' | 'google') => {
    setBusy(true)
    setError(null)
    try {
      const res = await fetch('/api/calendar/connections', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider }),
      })
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null
        setError(body?.error || 'Could not disconnect')
        return
      }
      setStatus((prev) => (prev ? { ...prev, [provider]: { connected: false, url: null } } : prev))
    } finally {
      setBusy(false)
    }
  }

  const copyUrl = async (url: string) => {
    await navigator.clipboard.writeText(url)
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1500)
  }

  const notionStatus = status?.notionDb
    ? status.notionDb.title
    : notionConnected
      ? `Notion connected${workspaceName ? ` · ${workspaceName}` : ''}`
      : 'Not connected'
  const appleStatus = status?.apple.connected ? 'Subscription link ready' : 'Not connected'
  const googleStatus = status?.google.connected ? 'Subscription link ready' : 'Not connected'
  const activeFeed = managing === 'apple' ? status?.apple : managing === 'google' ? status?.google : null

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold dark:text-white">Connections</h3>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          Choose where NodNotes dates show up. A Notion database appears in Notion Calendar. Apple and Google use a private calendar link.
        </p>
      </div>

      <div className="space-y-2">
        <ConnectionRow
          selected={managing === 'notion'}
          icon={<NotionMarkIcon className="h-4 w-4" />}
          title="Notion database"
          status={notionStatus}
          onSelect={() => setManaging('notion')}
        />
        <ConnectionRow
          selected={managing === 'apple'}
          icon={<CalendarDays className="h-4 w-4" />}
          title="Apple Calendar"
          status={appleStatus}
          onSelect={() => setManaging('apple')}
        />
        <ConnectionRow
          selected={managing === 'google'}
          icon={<CalendarDays className="h-4 w-4" />}
          title="Google Calendar"
          status={googleStatus}
          onSelect={() => setManaging('google')}
        />
      </div>

      {error ? <p className="text-sm text-red-600">{error}</p> : null}

      {managing === 'notion' && (
        <div className="space-y-3 rounded-lg border border-gray-200 p-4 dark:border-gray-700">
          {status?.notionDb ? (
            <>
              <p className="text-sm text-gray-600 dark:text-gray-300">
                {status.notionDb.title} is in your Notion workspace. In Notion Calendar, add this database to see its dates.
              </p>
              <div className="flex flex-wrap gap-2">
                {status.notionDb.url ? (
                  <a
                    href={status.notionDb.url}
                    target="_blank"
                    rel="noreferrer"
                    className={cn(buttonVariants({ variant: 'outline', size: 'sm' }))}
                  >
                    Open in Notion
                  </a>
                ) : null}
                <Button variant="outline" size="sm" onClick={() => void forgetDatabase()} disabled={busy}>
                  Remove link
                </Button>
              </div>
              <p className="text-xs text-gray-500">Removing the link does not delete the database in Notion.</p>
            </>
          ) : !notionConnected ? (
            <>
              <p className="text-sm text-gray-600 dark:text-gray-300">
                Connect Notion, then create a database with a Date property.
              </p>
              <Button size="sm" onClick={connectNotion}>
                Connect Notion
              </Button>
            </>
          ) : (
            <>
              <p className="text-sm text-gray-600 dark:text-gray-300">
                Pick a page the connection can edit. NodNotes creates a database named NodNotes dates on that page.
              </p>
              <Input
                value={pageQuery}
                onChange={(e) => setPageQuery(e.target.value)}
                placeholder="Search pages"
                className="dark:bg-gray-800 dark:border-gray-700"
              />
              <div className="max-h-48 space-y-1 overflow-y-auto">
                {visiblePages.length === 0 ? (
                  <p className="text-sm text-gray-500">No pages yet. Share a page with the NodNotes connection in Notion.</p>
                ) : (
                  visiblePages.map((page) => (
                    <button
                      key={page.id}
                      type="button"
                      onClick={() => setParentPageId(page.id)}
                      className={`block w-full truncate rounded-md px-2 py-1.5 text-left text-sm ${
                        parentPageId === page.id
                          ? 'bg-gray-100 font-medium dark:bg-gray-800'
                          : 'hover:bg-gray-50 dark:hover:bg-gray-800'
                      }`}
                    >
                      {page.title}
                    </button>
                  ))
                )}
              </div>
              <Button size="sm" onClick={() => void createDatabase()} disabled={!parentPageId || busy}>
                {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Create database
              </Button>
            </>
          )}
        </div>
      )}

      {(managing === 'apple' || managing === 'google') && (
        <div className="space-y-3 rounded-lg border border-gray-200 p-4 dark:border-gray-700">
          <p className="text-sm text-gray-600 dark:text-gray-300">
            {managing === 'apple'
              ? 'In Apple Calendar, choose File → New Calendar Subscription and paste this link.'
              : 'In Google Calendar, choose Other calendars → From URL and paste this link.'}
          </p>
          {activeFeed?.url ? (
            <>
              <Input readOnly value={activeFeed.url} className="font-mono text-xs dark:bg-gray-800 dark:border-gray-700" />
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" size="sm" onClick={() => void copyUrl(activeFeed.url!)}>
                  {copied ? 'Copied' : 'Copy link'}
                </Button>
                <Button variant="outline" size="sm" onClick={() => void disconnectFeed(managing)} disabled={busy}>
                  Disconnect
                </Button>
              </div>
              <p className="text-xs text-gray-500">Disconnecting makes this link stop working.</p>
            </>
          ) : (
            <Button size="sm" onClick={() => void connectFeed(managing)} disabled={busy}>
              {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Create calendar link
            </Button>
          )}
        </div>
      )}
    </div>
  )
}
