'use client'

// Mindmap.so-style Notion page picker — Add page as frame / Add page tree

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ChevronDown,
  ChevronRight,
  Check,
  ExternalLink,
  FileText,
  MoreVertical,
  PinOff,
  RefreshCw,
  Search,
  Sparkles,
  Table2,
  X,
} from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from './ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from './ui/dropdown-menu'
import { NotionMarkIcon } from './notion-mark-icon'
import { cn } from '@/lib/utils'
import type { NotionWorkspaceSummary } from '@/lib/notion/connection'

export type NotionPickerNode = {
  id: string
  object: 'page' | 'database'
  title: string
  url?: string
  icon?: {
    type?: string
    emoji?: string
    external?: { url?: string }
    file?: { url?: string }
  } | null
  children: NotionPickerNode[]
}

export type NotionPickerSection = {
  id: string // recently_edited | library
  title: string // Notion sidebar heading
  nodes: NotionPickerNode[] // Pages under this heading
}

type VisibleRow =
  | { kind: 'section'; section: NotionPickerSection; rowKey: string }
  | { kind: 'page'; node: NotionPickerNode; depth: number; rowKey: string }

type NotionImportModalProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  onImport: (opts: { pageIds: string[]; mode: 'card' | 'mindmap'; signal?: AbortSignal }) => Promise<void>
  authHref?: string
  workspaces: NotionWorkspaceSummary[]
  activeWorkspaceId: string | null
  onWorkspaceChange: (workspaceId: string) => void
  topBarPinned: boolean
  onSetTopBarPinned: (pinned: boolean) => void
  onDisconnect: () => Promise<void>
  disconnecting?: boolean
}

type NotionConnectionTypeId = 'import-pages' | 'page-sync' | 'database-sync'

const NOTION_CONNECTION_TYPES: Array<{
  id: NotionConnectionTypeId
  title: string
  description: string
  icon: typeof Sparkles
}> = [
  {
    id: 'import-pages',
    title: 'Import pages',
    description: 'Add Notion pages to your board',
    icon: Sparkles,
  },
  {
    id: 'page-sync',
    title: 'Page body sync',
    description: 'Live-sync page content with Notion',
    icon: RefreshCw,
  },
  {
    id: 'database-sync',
    title: 'Database sync',
    description: 'Sync database tables and cells',
    icon: Table2,
  },
]

const PICKER_EXPANDED_KEY = 'thinktable-notion-import-picker-expanded'

function readSavedPickerExpanded(): Set<string> | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.localStorage.getItem(PICKER_EXPANDED_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return null
    return new Set(
      parsed.filter((k): k is string => typeof k === 'string' && !k.startsWith('search:'))
    )
  } catch {
    return null
  }
}

function writeSavedPickerExpanded(expanded: Set<string>) {
  if (typeof window === 'undefined') return
  try {
    const keys = [...expanded].filter((k) => !k.startsWith('search:'))
    window.localStorage.setItem(PICKER_EXPANDED_KEY, JSON.stringify(keys))
  } catch {
    /* ignore quota */
  }
}

/** Both section headings open on first visit; nested pages stay collapsed. */
function defaultExpandedSections(sections: NotionPickerSection[]): Set<string> {
  const next = new Set<string>()
  for (const section of sections) {
    next.add(`section:${section.id}`)
  }
  return next
}

/** Saved expand/collapse, or both sections expanded when nothing is stored yet. */
function resolvePickerExpanded(sections: NotionPickerSection[]): Set<string> {
  const saved = readSavedPickerExpanded()
  if (saved) return saved
  return defaultExpandedSections(sections)
}

function NotionIcon({ icon, object }: { icon?: NotionPickerNode['icon']; object: 'page' | 'database' }) {
  if (icon?.type === 'emoji' && icon.emoji) {
    return <span className="text-base leading-none w-5 text-center flex-shrink-0">{icon.emoji}</span>
  }
  const url = icon?.type === 'external' ? icon.external?.url : icon?.type === 'file' ? icon.file?.url : null
  if (url) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={url} alt="" className="h-5 w-5 rounded-sm object-cover flex-shrink-0" />
  }
  return object === 'database' ? (
    <Table2 className="h-4 w-4 flex-shrink-0 text-blue-500" />
  ) : (
    <FileText className="h-4 w-4 flex-shrink-0 text-gray-400" />
  )
}

function flattenPages(
  nodes: NotionPickerNode[],
  expanded: Set<string>,
  depth: number,
  keyPrefix: string
): Array<{ node: NotionPickerNode; depth: number; rowKey: string }> {
  const out: Array<{ node: NotionPickerNode; depth: number; rowKey: string }> = []
  for (const node of nodes) {
    const rowKey = `${keyPrefix}${node.id}` // Prefix so Recently edited + Library can share a page id
    out.push({ node, depth, rowKey })
    if (node.children.length > 0 && expanded.has(rowKey)) {
      out.push(...flattenPages(node.children, expanded, depth + 1, keyPrefix))
    }
  }
  return out
}

function flattenPicker(
  sections: NotionPickerSection[],
  tree: NotionPickerNode[],
  expanded: Set<string>,
  query: string
): VisibleRow[] {
  const q = query.trim()
  if (q) {
    return flattenPages(filterTree(tree, q), expanded, 0, 'search:').map((row) => ({
      kind: 'page' as const,
      ...row,
    }))
  }
  const out: VisibleRow[] = []
  for (const section of sections) {
    const rowKey = `section:${section.id}` // Collapse key for Recently edited / Library
    out.push({ kind: 'section', section, rowKey })
    if (!expanded.has(rowKey)) continue
    out.push(
      ...flattenPages(section.nodes, expanded, 1, `${section.id}:`).map((row) => ({
        kind: 'page' as const,
        ...row,
      }))
    )
  }
  return out
}

function filterTree(nodes: NotionPickerNode[], query: string): NotionPickerNode[] {
  const q = query.trim().toLowerCase()
  if (!q) return nodes
  const filterNode = (node: NotionPickerNode): NotionPickerNode | null => {
    const childMatches = node.children.map(filterNode).filter(Boolean) as NotionPickerNode[]
    const selfMatch = node.title.toLowerCase().includes(q)
    if (selfMatch || childMatches.length > 0) {
      return { ...node, children: selfMatch ? node.children : childMatches }
    }
    return null
  }
  return nodes.map(filterNode).filter(Boolean) as NotionPickerNode[]
}

function collectExpandIds(nodes: NotionPickerNode[]): string[] {
  const ids: string[] = []
  const walk = (list: NotionPickerNode[]) => {
    for (const n of list) {
      if (n.children.length > 0) {
        ids.push(n.id)
        walk(n.children)
      }
    }
  }
  walk(nodes)
  return ids
}

export function NotionImportModal({
  open,
  onOpenChange,
  onImport,
  authHref,
  workspaces,
  activeWorkspaceId,
  onWorkspaceChange,
  topBarPinned,
  onSetTopBarPinned,
  onDisconnect,
  disconnecting = false,
}: NotionImportModalProps) {
  const [activeType, setActiveType] = useState<NotionConnectionTypeId>('import-pages')
  const [tree, setTree] = useState<NotionPickerNode[]>([])
  const [sections, setSections] = useState<NotionPickerSection[]>([]) // Recently edited / Library
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [expanded, setExpanded] = useState<Set<string>>(new Set()) // Empty = all sections + pages collapsed
  const [activeIndex, setActiveIndex] = useState(0)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [busyMode, setBusyMode] = useState<'card' | 'mindmap' | null>(null) // Adding vs generating label
  const searchRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const expandedRef = useRef(expanded) // Latest expand set for search restore (avoid effect loop)
  const wasSearching = useRef(false)
  const expandedBeforeSearch = useRef<Set<string> | null>(null)
  const abortRef = useRef<AbortController | null>(null) // In-flight Add frame / Generate mindmap

  expandedRef.current = expanded

  const loadPages = useCallback(async () => {
    if (!activeWorkspaceId) {
      setTree([])
      setSections([])
      return
    }
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/notion/pages?workspaceId=${encodeURIComponent(activeWorkspaceId)}`)
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to load pages')
      const nextTree = (data.tree || []) as NotionPickerNode[]
      const nextSections = (data.sections || []) as NotionPickerSection[]
      setTree(nextTree)
      setSections(nextSections)
      setExpanded(resolvePickerExpanded(nextSections))
      setActiveIndex(0)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load pages')
      setTree([])
      setSections([])
    } finally {
      setLoading(false)
    }
  }, [activeWorkspaceId])

  useEffect(() => {
    if (!open) return
    setActiveType('import-pages')
  }, [open])

  useEffect(() => {
    if (!open || !activeWorkspaceId) return
    wasSearching.current = false
    expandedBeforeSearch.current = null
    setQuery('')
    void loadPages()
    const t = window.setTimeout(() => searchRef.current?.focus(), 50)
    return () => window.clearTimeout(t)
  }, [open, activeWorkspaceId, loadPages])

  const filteredTree = useMemo(() => filterTree(tree, query), [tree, query])

  useEffect(() => {
    const searching = Boolean(query.trim())
    if (searching) {
      if (!wasSearching.current) {
        expandedBeforeSearch.current = new Set(expandedRef.current)
        wasSearching.current = true
      }
      // Auto-expand matches while searching (not persisted)
      setExpanded(new Set(collectExpandIds(filteredTree).map((id) => `search:${id}`)))
      return
    }
    if (wasSearching.current) {
      wasSearching.current = false
      setExpanded(expandedBeforeSearch.current ?? resolvePickerExpanded(sections))
      expandedBeforeSearch.current = null
    }
  }, [query, filteredTree, sections])

  const visible = useMemo(
    () => flattenPicker(sections, tree, expanded, query),
    [sections, tree, expanded, query]
  )

  useEffect(() => {
    if (activeIndex >= visible.length) setActiveIndex(Math.max(0, visible.length - 1))
  }, [visible.length, activeIndex])

  useEffect(() => {
    const el = listRef.current?.querySelector(`[data-picker-index="${activeIndex}"]`) as HTMLElement | null
    el?.scrollIntoView({ block: 'nearest' })
  }, [activeIndex])

  const toggleExpand = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      if (!id.startsWith('search:')) writeSavedPickerExpanded(next)
      return next
    })
  }

  const cancelImport = () => {
    abortRef.current?.abort() // Stop the fetch + server walk
    abortRef.current = null
    setBusyId(null) // Unlock the row immediately
    setBusyMode(null)
  }

  const runImport = async (pageId: string, mode: 'card' | 'mindmap') => {
    abortRef.current?.abort() // One import at a time
    const ac = new AbortController() // Token for this Add frame / Generate mindmap
    abortRef.current = ac
    setBusyId(pageId)
    setBusyMode(mode)
    try {
      await onImport({ pageIds: [pageId], mode, signal: ac.signal })
      if (ac.signal.aborted) return // Cancelled — keep the picker open
      onOpenChange(false)
    } catch (e) {
      const aborted =
        ac.signal.aborted ||
        (e instanceof DOMException && e.name === 'AbortError') ||
        (e instanceof Error && e.name === 'AbortError')
      if (aborted) return // User hit Cancel — no error toast
      window.alert(e instanceof Error ? e.message : 'Import failed')
    } finally {
      if (abortRef.current === ac) abortRef.current = null
      setBusyId(null)
      setBusyMode(null)
    }
  }

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.stopPropagation()
      onOpenChange(false)
      return
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActiveIndex((i) => Math.min(i + 1, Math.max(0, visible.length - 1)))
      return
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActiveIndex((i) => Math.max(i - 1, 0))
      return
    }
    if (e.key === 'ArrowRight') {
      const row = visible[activeIndex]
      const canExpand =
        row?.kind === 'section' || (row?.kind === 'page' && row.node.children.length > 0)
      if (canExpand) {
        e.preventDefault()
        setExpanded((prev) => {
          const next = new Set(prev).add(row.rowKey)
          if (!row.rowKey.startsWith('search:')) writeSavedPickerExpanded(next)
          return next
        })
      }
      return
    }
    if (e.key === 'ArrowLeft') {
      const row = visible[activeIndex]
      if (row && expanded.has(row.rowKey)) {
        e.preventDefault()
        setExpanded((prev) => {
          const next = new Set(prev)
          next.delete(row.rowKey)
          if (!row.rowKey.startsWith('search:')) writeSavedPickerExpanded(next)
          return next
        })
      }
      return
    }
    if (e.key === 'Enter') {
      const row = visible[activeIndex]
      if (!row) return
      e.preventDefault()
      if (row.kind === 'section') {
        toggleExpand(row.rowKey) // Enter on a heading opens Recently edited / Library
        return
      }
      void runImport(row.node.id, e.shiftKey ? 'mindmap' : 'card')
    }
  }

  const activeConnection = NOTION_CONNECTION_TYPES.find((t) => t.id === activeType) ?? NOTION_CONNECTION_TYPES[0]
  const activeWorkspace =
    workspaces.find((w) => w.workspaceId === activeWorkspaceId) ?? workspaces[0] ?? null

  const pageList = (
    <>
      {query.trim() ? (
        <div className="px-1 pb-1">
          <h3 className="text-xs font-semibold text-gray-500">Best matches</h3>
        </div>
      ) : null}

      <div ref={listRef} className={cn('flex-1 overflow-y-auto px-1 pb-2 min-h-0', !query.trim() && 'pt-1')}>
        {loading && <div className="px-3 py-8 text-sm text-gray-500 text-center">Loading Notion pages…</div>}
        {error && !loading && <div className="px-3 py-8 text-sm text-red-600 text-center">{error}</div>}
        {!loading && !error && visible.length === 0 && (
          <div className="px-3 py-8 text-sm text-gray-500 text-center">No pages found</div>
        )}

        {!loading &&
          visible.map((row, index) => {
            const isActive = index === activeIndex
            if (row.kind === 'section') {
              const isExpanded = expanded.has(row.rowKey)
              return (
                <button
                  key={row.rowKey}
                  type="button"
                  data-picker-index={index}
                  className={cn(
                    'flex w-full items-center gap-1 rounded-lg px-1 py-1.5 text-left transition-colors',
                    isActive ? 'bg-gray-100' : 'hover:bg-gray-50'
                  )}
                  onMouseEnter={() => setActiveIndex(index)}
                  onClick={() => toggleExpand(row.rowKey)}
                  aria-expanded={isExpanded}
                >
                  {isExpanded ? (
                    <ChevronDown className="h-4 w-4 flex-shrink-0 text-gray-400" />
                  ) : (
                    <ChevronRight className="h-4 w-4 flex-shrink-0 text-gray-400" />
                  )}
                  <span className="truncate text-xs font-semibold text-gray-500">
                    {row.section.title}
                  </span>
                </button>
              )
            }

            const { node, depth, rowKey } = row
            const hasChildren = node.children.length > 0
            const isExpanded = expanded.has(rowKey)
            const isBusy = busyId === node.id

            return (
              <div
                key={rowKey}
                data-picker-index={index}
                className={cn(
                  'group flex items-center gap-1 rounded-lg px-1 py-1.5 transition-colors',
                  isActive ? 'bg-gray-100' : 'hover:bg-gray-50'
                )}
                style={{ paddingLeft: 8 + depth * 16 }}
                onMouseEnter={() => setActiveIndex(index)}
              >
                <button
                  type="button"
                  className={cn(
                    'h-6 w-6 flex items-center justify-center rounded text-gray-400 hover:text-gray-700 flex-shrink-0',
                    !hasChildren && 'invisible'
                  )}
                  onClick={(e) => {
                    e.stopPropagation()
                    toggleExpand(rowKey)
                  }}
                  aria-label={isExpanded ? 'Collapse' : 'Expand'}
                >
                  {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                </button>

                <button
                  type="button"
                  className="flex min-w-0 flex-1 items-center gap-2 text-left"
                  onClick={() => setActiveIndex(index)}
                  onDoubleClick={() => void runImport(node.id, 'card')}
                >
                  <NotionIcon icon={node.icon} object={node.object} />
                  <span className="truncate text-sm text-gray-900">{node.title}</span>
                </button>

                <div
                  className={cn(
                    'flex items-center gap-1.5 flex-shrink-0 whitespace-nowrap',
                    isBusy || isActive ? 'opacity-100' : 'opacity-0 group-hover:opacity-100 transition-opacity'
                  )}
                >
                  {isBusy && busyMode === 'card' ? (
                    <>
                      <span className="text-xs font-medium text-blue-700 whitespace-nowrap">Adding…</span>
                      <button
                        type="button"
                        onClick={cancelImport}
                        className="text-xs font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-md px-2.5 py-1.5 flex-shrink-0"
                      >
                        Cancel
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      disabled={!!busyId}
                      onClick={() => void runImport(node.id, 'card')}
                      className="text-xs text-gray-500 hover:text-gray-800 px-1.5 py-1 disabled:opacity-40"
                    >
                      Add page as frame
                    </button>
                  )}
                  {isBusy && busyMode === 'mindmap' ? (
                    <>
                      <span className="text-xs font-medium text-blue-700 whitespace-nowrap">Adding tree…</span>
                      <button
                        type="button"
                        onClick={cancelImport}
                        className="text-xs font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-md px-2.5 py-1.5 flex-shrink-0"
                      >
                        Cancel
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      disabled={!!busyId}
                      onClick={() => void runImport(node.id, 'mindmap')}
                      className="text-xs font-medium text-blue-700 bg-blue-50 hover:bg-blue-100 rounded-md px-2.5 py-1.5 disabled:opacity-40"
                    >
                      Add page tree
                    </button>
                  )}
                </div>
              </div>
            )
          })}
      </div>
    </>
  )

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next && busyId) cancelImport()
        onOpenChange(next)
      }}
    >
      <DialogContent
        className="flex max-h-[min(80vh,680px)] w-full max-w-[900px] flex-col gap-0 overflow-hidden rounded-xl border-gray-200 p-0 shadow-2xl"
        onKeyDown={activeType === 'import-pages' ? onKeyDown : undefined}
      >
        <DialogTitle className="sr-only">Notion connection</DialogTitle>
        <DialogDescription className="sr-only">
          Manage your Notion connection and add pages to your board
        </DialogDescription>

        <div className="flex min-h-0 flex-1">
          {/* Left sidebar — Notion connection types */}
          <aside className="flex w-[240px] flex-shrink-0 flex-col border-r border-gray-100 bg-gray-50/80">
            <div className="border-b border-gray-100 px-4 py-4">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/notion-color.svg" alt="" className="h-8 w-8" />
              <div className="mt-3 flex items-center gap-1">
                <div className="min-w-0 flex-1 text-sm font-semibold text-gray-900">Notion</div>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button
                      type="button"
                      className="inline-flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-md text-gray-500 hover:bg-gray-100 hover:text-gray-800"
                      aria-label="Notion connection options"
                    >
                      <MoreVertical className="h-4 w-4" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start" className="w-48">
                    {topBarPinned ? (
                      <DropdownMenuItem onSelect={() => onSetTopBarPinned(false)}>
                        <PinOff className="mr-2 h-4 w-4" />
                        Unpin from top bar
                      </DropdownMenuItem>
                    ) : (
                      <DropdownMenuItem onSelect={() => onSetTopBarPinned(true)}>
                        <NotionMarkIcon className="mr-2 h-4 w-4" />
                        Pin to top bar
                      </DropdownMenuItem>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
              <div className="mt-2 text-xs text-gray-400">
                {workspaces.length} workspace{workspaces.length === 1 ? '' : 's'} connected
              </div>
            </div>
            <nav className="flex-1 overflow-y-auto p-2">
              {NOTION_CONNECTION_TYPES.map((type) => {
                const Icon = type.icon
                const selected = activeType === type.id
                return (
                  <button
                    key={type.id}
                    type="button"
                    onClick={() => setActiveType(type.id)}
                    className={cn(
                      'mb-1 w-full rounded-lg border px-3 py-2.5 text-left transition-colors',
                      selected
                        ? 'border-gray-200 bg-white shadow-sm'
                        : 'border-transparent hover:bg-white/70'
                    )}
                  >
                    <div className="flex gap-2.5">
                      <Icon className="mt-0.5 h-4 w-4 flex-shrink-0 text-gray-500" />
                      <div className="min-w-0">
                        <div className="text-sm font-medium text-gray-900">{type.title}</div>
                        <div className="text-xs leading-snug text-gray-500">{type.description}</div>
                      </div>
                    </div>
                  </button>
                )
              })}
            </nav>
          </aside>

          {/* Main panel */}
          <div className="flex min-w-0 flex-1 flex-col">
            <div className="border-b border-gray-100 px-5 pb-4 pt-5">
              <h2 className="text-lg font-semibold text-gray-900">
                {activeType === 'import-pages' ? 'Add Notion pages' : activeConnection.title}
              </h2>
              {workspaces.length > 0 ? (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button
                      type="button"
                      className="mt-1 inline-flex max-w-full items-center gap-1 rounded-md text-sm text-gray-500 hover:bg-gray-50 hover:text-gray-900"
                    >
                      <span className="truncate">
                        {activeWorkspace?.workspaceName || 'Workspace'}
                      </span>
                      <ChevronDown className="h-3.5 w-3.5 flex-shrink-0" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start" className="w-56">
                    {workspaces.map((workspace) => (
                      <DropdownMenuItem
                        key={workspace.workspaceId}
                        onSelect={() => onWorkspaceChange(workspace.workspaceId)}
                      >
                        <span className="truncate">{workspace.workspaceName || 'Workspace'}</span>
                        {workspace.workspaceId === activeWorkspaceId ? (
                          <Check className="ml-auto h-4 w-4 flex-shrink-0 text-blue-600" />
                        ) : null}
                      </DropdownMenuItem>
                    ))}
                    {authHref ? (
                      <DropdownMenuItem asChild>
                        <a href={authHref} className="cursor-pointer">
                          Connect another workspace
                        </a>
                      </DropdownMenuItem>
                    ) : null}
                  </DropdownMenuContent>
                </DropdownMenu>
              ) : null}
            </div>

            {activeType === 'import-pages' ? (
              <>
                <div className="flex flex-shrink-0 items-center gap-2 border-b border-gray-100 px-5 py-3">
                  <div className="relative min-w-0 flex-1">
                    <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />
                    <input
                      ref={searchRef}
                      value={query}
                      onChange={(e) => {
                        setQuery(e.target.value)
                        setActiveIndex(0)
                      }}
                      placeholder="Search notion pages"
                      className="h-8 w-full rounded-md border border-blue-200 bg-white pl-7 pr-7 text-sm text-gray-900 outline-none focus:border-blue-400"
                      onKeyDown={(e) => e.stopPropagation()}
                    />
                    {query && (
                      <button
                        type="button"
                        className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                        onClick={() => setQuery('')}
                        aria-label="Clear search"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                  <a
                    href="https://www.notion.so/new"
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex h-8 flex-shrink-0 items-center rounded-md border border-gray-200 bg-white px-3 text-sm font-medium text-gray-700 hover:bg-gray-50"
                  >
                    Create new
                  </a>
                </div>

                <div className="flex min-h-0 flex-1 flex-col">{pageList}</div>

                {authHref ? (
                  <div className="flex-shrink-0 border-t border-gray-100 px-5 py-3">
                    <a
                      href={authHref}
                      className="inline-flex items-center gap-2 text-sm text-gray-700 hover:text-gray-900"
                    >
                      <ExternalLink className="h-4 w-4 text-gray-500" />
                      Edit permissions
                    </a>
                  </div>
                ) : null}
              </>
            ) : (
              <div className="flex-1 px-5 py-6 text-sm text-gray-600">
                <p className="font-medium text-gray-900">Connected</p>
                <p className="mt-1 text-gray-500">
                  {activeType === 'page-sync'
                    ? 'Imported Notion pages on your board live-sync content with Notion.'
                    : 'Notion database frames sync table data and cell edits with Notion.'}
                </p>
              </div>
            )}

            <div className="mt-auto flex-shrink-0 border-t border-gray-100 px-5 py-4">
              <div className="flex items-center justify-between gap-4 rounded-lg border border-red-100 bg-red-50/40 px-4 py-3">
                <div>
                  <div className="text-sm font-medium text-gray-900">Remove and disconnect</div>
                  <div className="text-xs text-gray-500">Remove Notion from this workspace</div>
                </div>
                <button
                  type="button"
                  disabled={disconnecting}
                  onClick={() => void onDisconnect()}
                  className="flex-shrink-0 rounded-md border border-red-200 bg-white px-3 py-1.5 text-sm font-medium text-red-600 hover:bg-red-50 disabled:opacity-50"
                >
                  Disconnect Notion
                </button>
              </div>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
